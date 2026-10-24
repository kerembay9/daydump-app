#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "google-api-python-client>=2.0.0",
#   "google-auth>=2.0.0",
# ]
# ///
"""
Uploads a release Android App Bundle (.aab) to Google Play Console.
Usage:
    python3 scripts/publish_play.py [--aab path/to/app.aab] [--track internal] [--draft]
"""

import argparse
import os
import socket
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# Increase socket timeout for large App Bundle uploads (170MB+)
socket.setdefaulttimeout(600)

PACKAGE_NAME = "com.horizonzeta.picdump"
DEFAULT_KEY = os.path.expanduser("~/.gemini/antigravity/play-service-account.json")
DEFAULT_AAB = "/Users/kerembayramoglu/Desktop/picdump.aab"
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]


def main():
    parser = argparse.ArgumentParser(description="Publish PicDump AAB to Google Play Console")
    parser.add_argument("--aab", default=DEFAULT_AAB, help=f"Path to .aab (default: {DEFAULT_AAB})")
    parser.add_argument("--key", default=DEFAULT_KEY, help=f"Service account key (default: {DEFAULT_KEY})")
    parser.add_argument("--track", default="internal", choices=["internal", "closed", "alpha", "beta"],
                        help="Release track (default: internal)")
    parser.add_argument("--draft", action="store_true", help="Create as draft release instead of active rollout")
    parser.add_argument("--notes", default="Bug fixes and performance improvements.", help="Release notes")
    args = parser.parse_args()

    if not os.path.exists(args.key):
        sys.exit(f"Error: Service account key not found at {args.key}")
    if not os.path.exists(args.aab):
        sys.exit(f"Error: AAB file not found at {args.aab}")

    print(f"Authenticating with: {args.key}")
    creds = service_account.Credentials.from_service_account_file(args.key, scopes=SCOPES)
    service = build("androidpublisher", "v3", credentials=creds)

    print(f"Creating edit for {PACKAGE_NAME}...")
    edit_req = service.edits().insert(packageName=PACKAGE_NAME, body={})
    edit = edit_req.execute()
    edit_id = edit["id"]
    print(f"Edit created (ID: {edit_id})")

    try:
        print(f"Uploading {args.aab} ({os.path.getsize(args.aab) / (1024 * 1024):.1f} MB)...")
        media = MediaFileUpload(args.aab, mimetype="application/octet-stream", chunksize=10 * 1024 * 1024, resumable=True)
        bundle_req = service.edits().bundles().upload(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            media_body=media,
            ackBundleInstallationWarning=True,
        )
        response = None
        while response is None:
            upload_status, response = bundle_req.next_chunk()
            if upload_status:
                print(f"Uploaded {int(upload_status.progress() * 100)}%...")
        bundle_resp = response
        version_code = bundle_resp["versionCode"]
        print(f"Bundle uploaded successfully! Version Code: {version_code}")

        status = "draft" if args.draft else "completed"
        release_body = {
            "name": f"Release {version_code}",
            "versionCodes": [str(version_code)],
            "status": status,
            "releaseNotes": [{"language": "en-US", "text": args.notes}],
        }

        print(f"Assigning bundle to track '{args.track}' (status: {status})...")
        track_req = service.edits().tracks().update(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            track=args.track,
            body={"track": args.track, "releases": [release_body]},
        )
        track_req.execute()

        print("Committing edit to Google Play...")
        commit_req = service.edits().commit(packageName=PACKAGE_NAME, editId=edit_id)
        commit_req.execute()
        print(f"SUCCESS! PicDump (Version Code {version_code}) is published to the '{args.track}' track.")

    except Exception as e:
        print(f"\nFailed: {e}")
        try:
            service.edits().delete(packageName=PACKAGE_NAME, editId=edit_id).execute()
            print("Aborted edit to leave Play Console clean.")
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()

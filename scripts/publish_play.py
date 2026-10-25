#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "google-auth>=2.0.0",
#   "requests>=2.28.0",
# ]
# ///
"""
Uploads a release Android App Bundle (.aab) to Google Play Console.
Usage:
    python3 scripts/publish_play.py [--aab path/to/app.aab] [--track internal] [--draft]
"""

import argparse
import json
import os
import subprocess
import sys
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

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
    creds.refresh(Request())
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json",
    }

    print(f"Creating edit for {PACKAGE_NAME}...")
    edit_resp = requests.post(
        f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/edits",
        headers=headers,
        json={},
    )
    edit_resp.raise_for_status()
    edit_id = edit_resp.json()["id"]
    print(f"Edit created (ID: {edit_id})")

    try:
        filesize = os.path.getsize(args.aab)
        print(f"Initiating upload for {args.aab} ({filesize / (1024 * 1024):.1f} MB)...")
        init_headers = {
            "Authorization": f"Bearer {creds.token}",
            "X-Upload-Content-Type": "application/octet-stream",
            "X-Upload-Content-Length": str(filesize),
        }
        init_url = (
            f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/"
            f"{PACKAGE_NAME}/edits/{edit_id}/bundles?uploadType=resumable&ackBundleInstallationWarning=true"
        )
        init_resp = requests.post(init_url, headers=init_headers)
        init_resp.raise_for_status()
        upload_url = init_resp.headers.get("Location")
        if not upload_url:
            raise RuntimeError(f"No upload Location header returned: {init_resp.text}")

        print("Streaming bundle to Google Play via native curl with TCP keepalive...")
        curl_cmd = [
            "curl",
            "-sS",
            "-X", "PUT",
            "--upload-file", args.aab,
            "-H", "Content-Type: application/octet-stream",
            "-H", f"Content-Length: {filesize}",
            "--keepalive-time", "15",
            "--connect-timeout", "60",
            upload_url,
        ]
        proc = subprocess.run(curl_cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"curl upload failed (code {proc.returncode}): {proc.stderr}")

        output = proc.stdout.strip()
        print("Google Play response received:", output[:200])
        bundle_resp = json.loads(output)
        if "versionCode" not in bundle_resp:
            raise RuntimeError(f"Unexpected bundle upload response: {output}")

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
        track_resp = requests.put(
            f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/edits/{edit_id}/tracks/{args.track}",
            headers=headers,
            json={"track": args.track, "releases": [release_body]},
        )
        track_resp.raise_for_status()

        print("Committing edit to Google Play...")
        commit_resp = requests.post(
            f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/edits/{edit_id}:commit",
            headers=headers,
        )
        commit_resp.raise_for_status()
        print(f"SUCCESS! PicDump (Version Code {version_code}) is published to the '{args.track}' track.")

    except Exception as e:
        print(f"\nFailed: {e}")
        try:
            requests.delete(
                f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/edits/{edit_id}",
                headers=headers,
            )
            print("Aborted edit to leave Play Console clean.")
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()

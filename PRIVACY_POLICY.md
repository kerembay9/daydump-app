# Privacy Policy for DayDump

**Last Updated:** October 15, 2026  
**Effective Date:** October 15, 2026

At **DayDump**, accessible from the DayDump mobile application, user privacy is our highest priority. This Privacy Policy document explains how personal information and device media are handled.

---

## 1. On-Device Photo Processing & Zero Cloud Uploads

DayDump is architected with a **local-first, privacy-by-design approach**:
- **On-Device Artificial Intelligence:** DayDump performs photo clustering, visual scene analysis, and carousel generation locally on your device hardware using quantized neural networks (such as Google Gemma E2B via MediaPipe Tasks GenAI).
- **Zero Image Cloud Storage:** Your photos, metadata, and timestamps **never leave your device**. They are not uploaded to external servers, shared with third parties, or used to train public machine learning models.
- **Optional Cloud Multimodal Fallback:** If you choose to manually provide your own Gemini API key for enhanced cloud multimodal descriptions, image thumbnails are sent directly from your device to Google Cloud Vertex/Gemini API using encrypted HTTPS and are not retained by DayDump.

---

## 2. Permissions Requested & Why

DayDump requests only the minimal permissions required to function:
1. **Photo Library / Storage Access (`READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE`):**
   - *Purpose:* Used strictly to discover photos taken today or matching your requested theme queries, and to curate them into aesthetic carousels.
2. **Write Media Permission (`WRITE_EXTERNAL_STORAGE`):**
   - *Purpose:* Used strictly when you tap "Save All to Album" or "Export Slide" to save the finished 4:5 framed JPEG cards into a dedicated `DayDump` folder in your camera roll.

---

## 3. In-App Purchases & Subscriptions

DayDump processes subscription transactions through **Google Play Billing** and **Apple App Store In-App Purchases**, facilitated by **RevenueCat**:
- DayDump does not collect, process, or store credit card or payment information.
- Anonymous app user IDs are shared with RevenueCat solely to validate your active subscription entitlement and restore previous purchases across devices.

---

## 4. Analytics & Diagnostics

Anonymous operational diagnostic logs (such as whether an on-device model loaded successfully or crash logs) may be collected to fix bugs and improve stability. No photos, camera roll contents, or personal identifiable information are ever included in diagnostic events.

---

## 5. Contact Us

If you have any questions or concerns regarding this Privacy Policy or your data, please contact us at:
- **Email:** support@daydump.app
- **Website:** https://github.com/kerembay9/daydump-app

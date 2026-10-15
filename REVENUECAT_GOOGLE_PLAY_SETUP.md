# RevenueCat & Google Play Store Setup Guide for DayDump

**Package Name:** `com.daydump.app`  
**Entitlement ID:** `pro_access` (or `DayDumpPro`)  
**Pricing Tier:** Aggressive Creator Model ($3.99/week with 3-day trial, $34.99/year, $59.99 lifetime)

---

## 1. Create Google Cloud Service Account Credentials

Google Play Console requires server-to-server **Service Account** authentication so RevenueCat can validate receipts, auto-renewals, and free trial conversions.

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project linked to your Google Play Developer Account.
3. Navigate to **IAM & Admin** > **Service Accounts**.
4. Click **Create Service Account**:
   - **Service account name:** `revenuecat-daydump-validator`
   - **Service account ID:** `revenuecat-daydump-validator` (auto-filled)
   - **Description:** `Service account for DayDump RevenueCat Play Store receipt validation`
5. Click **Create and Continue**, skip optional role steps, and click **Done**.

---

## 2. Enable the Google Play Android Developer API

1. In Google Cloud Console, navigate to **APIs & Services** > **Library**.
2. Search for **"Google Play Android Developer API"**.
3. Click **Enable**.

---

## 3. Link Service Account in Google Play Console

1. Open [Google Play Console](https://play.google.com/console/).
2. Select **Setup** > **API access** (or **Settings** > **Developer account** > **API access**).
3. Under the **Service accounts** section, click **Link service account**.
4. Select `revenuecat-daydump-validator@...iam.gserviceaccount.com`.
5. Under **Account permissions**, grant:
   - **View financial data, orders, and cancellation survey responses** (Mandatory)
   - **Manage orders and subscriptions** (Mandatory for refunds/grace periods)
6. Click **Grant Access** / **Save**.

---

## 4. Generate JSON Key & Connect to RevenueCat

1. Back in Google Cloud Console > **IAM & Admin** > **Service Accounts**, click your newly created service account.
2. Go to the **Keys** tab > **Add Key** > **Create new key**.
3. Choose **JSON** and download the file. *(Keep this file secure; never commit it to Git!)*
4. Log into your [RevenueCat Dashboard](https://app.revenuecat.com/).
5. Go to **Project Settings** > **Integrations** > **Google Play**.
6. Enter package name: `com.daydump.app`.
7. Upload your JSON private key file and click **Save**.

---

## 5. Configure Subscription Products in Google Play Console

In Google Play Console under **Monetize with Play** > **Products** > **Subscriptions**:

| Product ID | Base Plan ID | Offer ID / Free Trial | Price |
| :--- | :--- | :--- | :--- |
| `daydump_weekly_399` | `weekly` | `3-day-free-trial` (Type: Free trial, 3 Days) | \$3.99 / week |
| `daydump_annual_3499` | `annual` | Optional: 7-day trial or default | \$34.99 / year |

Under **In-app products**:
| Product ID | Type | Price |
| :--- | :--- | :--- |
| `daydump_lifetime_5999` | Non-consumable (One-time purchase) | \$59.99 |

---

## 6. Map Products in RevenueCat Dashboard

1. In RevenueCat, create an **Entitlement**:
   - Identifier: `pro_access`
   - Description: `Unlocks All Frames, Unlimited Dumps, and High-Res Export`
2. Create **Products** in RevenueCat matching the Google Play IDs:
   - `daydump_weekly_399`
   - `daydump_annual_3499`
   - `daydump_lifetime_5999`
3. Attach each product to the `pro_access` entitlement.
4. Under **Offerings** > Default Offering:
   - Package `$rc_weekly` $\rightarrow$ `daydump_weekly_399`
   - Package `$rc_annual` $\rightarrow$ `daydump_annual_3499`
   - Package `$rc_lifetime` $\rightarrow$ `daydump_lifetime_5999`
5. Copy your RevenueCat Public Android API Key (`goog_...`) into `src/services/revenuecat.ts`.

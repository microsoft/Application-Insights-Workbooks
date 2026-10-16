# Native synced-passkey enrollment readiness

The **Synced Passkey** tabs in `Phishing-Resistant Passwordless.workbook` identify native platform capability candidates from `SigninLogs`. They do not prove passkey registration, provider/account configuration, authentication-policy eligibility, or enforcement readiness. The existing credentials, Windows panels, and enforcement phase are unchanged.

## Criteria and evidence

The [Microsoft Entra synced-passkey prerequisites](https://learn.microsoft.com/en-us/entra/identity/authentication/how-to-synced-passkeys#prerequisites-for-synced-passkey), reviewed September 24, 2026, specify Android 9+ for native Google Password Manager, excluding Samsung devices; iOS 16+ and macOS 13+ for native iCloud Keychain. Browser-based and third-party-provider paths are outside these panels.

OS versions come only from `parse_user_agent(UserAgent, "os").OperatingSystem`, compared as integers. `DeviceDetail.operatingSystem` supplies a platform family, not a version. A recognized DeviceDetail family takes precedence when it conflicts with the user-agent family, but the conflicting user-agent version is not used. Platforms missing from both sources cannot be assigned to a platform tab.

Missing, invalid, nonpositive, or conflicting versions are **Unknown**. macOS user-agent 10.x versions are **Unknown**, because modern clients can mask their actual version. Android 10 with the generic model `K` is also treated as potentially reduced user-agent evidence. A desktop-style Mac user agent never establishes an iOS version. Even apparently usable user-agent values can be spoofed or frozen; **Ready** is a candidate classification, not verified device inventory.

Android manufacturer evidence comes from `parse_user_agent(UserAgent, "device").Device.Brand` and `.Device.Model`. Samsung brand or model prefixes `SM-`, `GT-`, `SCH-`, `SGH-`, `SHV-`, `SHW-`, and `SPH-` are excluded from the documented native scope. This does not mean Samsung devices cannot use passkeys. Ready candidates require a recognized non-Samsung brand: Google, Huawei, Xiaomi, OnePlus, Motorola, Sony, Nokia, OPPO, Vivo, Realme, ASUS, Lenovo, LG, HTC, Honor, ZTE, Nothing, or Fairphone. Other, missing, or generic manufacturers remain **Unknown** rather than being assumed non-Samsung. A model alone is not used to infer a non-Samsung brand or provider availability.

## Filters, selection, and counts

Both views use the selected workspace(s), time range, apps, users, and device-readiness values. App and user filters retain the workbook's existing display-name selection semantics (including its quoted multi-select values and `*` for All). Queries include only successful (`ResultType == "0"`) sign-ins with `CrossTenantAccessType == "none"`.

Within this filtered scope and platform, each user/device ID pair contributes its latest matching sign-in. Rows without a device ID contribute one additional unresolved observation per user/platform; several real devices can be collapsed into that row. A user with both identified and unidentified device observations can contribute both. The identity key uses UserId first, then trimmed, lower-case UPN. Rows missing both are excluded; display names are not identity keys. Rows lacking UserId cannot be joined reliably to a different row that has only an ID, so identifier availability can also split observations.

The latest row is chosen before readiness filtering: an older Ready row must not replace a newer Unknown or NotReady row. Pie slices count **observed records**, not distinct users, sign-ins, or unique devices. The table includes record type, names, identifiers, reported evidence, reason, and latest matching sign-in time.

Each platform has its own chart-selection parameter. Initial and cleared selections show All; a slice filters only its table, not the chart. The existing mobile default remains Authenticator App Passkey even though Synced Passkey appears first. macOS still defaults to Platform SSO Secure Enclave Key.

## Static boundary cases and validation limits

`test/syncedPasskeyEnrollmentTest.js` uses the repository's existing Mocha/Chai harness to check layout, navigation/defaults, filter parity, selection isolation, query guards, native thresholds, projection labels, and observed-record aggregation. Run it together with existing workbook validation:

```shell
npm test -- --grep "Synced passkey enrollment|Validating Workbooks"
```

The following are expected query cases for review, not claims of executing KQL against a service. Version and device fields below refer to parsed user-agent evidence unless otherwise stated. No customer logs, tenant configuration, live queries, or Azure deployments are required by the static tests. Portal rendering, parser behavior on real user agents, and end-to-end KQL execution require a separate authorized validation using [Testing.md](../../../Documentation/Testing.md).

| Evidence or selection | Expected outcome |
| --- | --- |
| Android 8, recognized non-Samsung brand | NotReady: below native minimum |
| Android 9, recognized non-Samsung brand | Ready candidate: exact minimum |
| Android 10 with a non-generic model, recognized brand | Ready candidate; numeric comparison |
| Android 14 or later, recognized non-Samsung brand | Ready candidate; no Android 14 third-party gate |
| Android 9+, Samsung brand (any case) | NotReady: excluded native scope |
| Android 9+, absent/different brand but `SM-` Samsung model | NotReady: Samsung model evidence overrides brand |
| Android 9+, each of `GT-`, `SCH-`, `SGH-`, `SHV-`, `SHW-`, `SPH-` model prefixes | NotReady: excluded native scope |
| Android 9+, missing, Generic, or unrecognized brand and no Samsung model | Unknown: cannot establish non-Samsung manufacturer |
| Android 8, unknown manufacturer and no Samsung model | Unknown: manufacturer uncertainty is not silently resolved |
| Android 10, generic model `K` | Unknown: potentially reduced OS evidence |
| Android missing/invalid version, even with Samsung evidence | Unknown: version guard takes precedence |
| iOS 15 | NotReady: below native minimum |
| iOS 16 | Ready candidate: exact minimum |
| iOS 17 or later | Ready candidate; no browser/provider-app gate |
| macOS 11 or 12 | NotReady: explicit version below native minimum |
| macOS 13 | Ready candidate: exact minimum |
| macOS 14 or later | Ready candidate |
| macOS 10.15 or any 10.x | Unknown, not NotReady: potentially masked |
| Any platform with empty, nonnumeric, zero, or negative major version | Unknown |
| DeviceDetail contains only Android, iOS, or macOS; UA absent/unrecognized | Corresponding platform, Unknown version |
| DeviceDetail includes a version, UA absent | Unknown: no DeviceDetail version inference |
| DeviceDetail iOS, UA Mac OS X 13 | iOS Unknown; Mac version is not an iOS version |
| DeviceDetail macOS, UA iOS 16 | macOS Unknown: conflicting evidence |
| Both platform sources absent/unrecognized | Excluded from platform tabs; cannot assign a family |
| Same UserId/device ID, older Ready then newer Unknown | One Unknown observation |
| Same UserId/device ID, older NotReady then newer Ready | One Ready observation |
| Same UserId and platform, several rows with empty device IDs | One latest unresolved observation, not multiple unique devices |
| Same user with a device ID and also an empty-device row | One user/device pair plus one unresolved observation |
| Different UserIds with identical display names | Separate observations |
| Missing UserId, same UPN with case/outer-whitespace differences | One normalized identity for the same observation key |
| Both UserId and UPN absent | Excluded, regardless of display name |
| Failed or cross-tenant sign-in | Excluded before aggregation |
| App/user multi-select or time/workspace restrictions | Both chart and table use the same restricted evidence |
| Device Readiness Ready, latest row Unknown | Excluded; older Ready row is not resurrected |
| Initial selection, deselected chart, or empty exported selection | All records allowed by the shared filters |
| Select Ready/NotReady/Unknown slice | Only that platform's table changes; chart remains unfiltered by its selection |

No public screenshots are included: these changes have not been rendered in a tenant, and tenant screenshots must not be copied into this contribution.

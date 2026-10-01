# Security Runbook

Operational procedures for branch staff and maintainers. UI labels are quoted exactly as they appear in the Arabic interface.

## 1. Setting Up a New Branch Computer

1. Install the application (run the Windows installer from the GitHub release).
2. Launch the app. The first-run setup screen appears.
3. Create the first superadmin account:
   - Username: choose a unique identifier.
   - Password: at least 6 characters and not a common password. The form shows the rule «6 أحرف على الأقل؛ يمكنك استخدام الحروف أو الأرقام فقط أو اختيار كلمة مرور أكثر تعقيداً. تجنب كلمات المرور الشائعة.» A longer password is safer.
   - Click «إنشاء مدير النظام» (Create system administrator).
4. Log in with the new superadmin account.
5. Open **الإعدادات** in the sidebar (page «إعدادات النظام والنسخ الاحتياطي»), tab «النسخ الاحتياطي»:
   - **مسار حفظ النسخ الاحتياطي**: click «اختيار...» and pick an absolute, existing, writable folder (e.g. `D:\Backups\QuranBranch`). The scheduler will not start without a valid path.
   - **رمز النقل الموحد للمؤسسة (Association Transfer Key)**: enter a shared secret used to encrypt backups so they can be restored on another branch computer. Save it securely (password manager, printed copy in a safe). Without it, backups are encrypted with this computer's database key and cannot be restored elsewhere.
   - Click **حفظ جميع التغييرات** (Save All Changes) at the bottom of the page.
   - Enable **تفعيل النسخ التلقائي** (Enable Automatic Backup), choose **تكرار النسخ** (Frequency: يوميًا / أسبوعيًا / شهريًا) and **توقيت النسخ** (Time, e.g. 02:00).
   - Click **حفظ جميع التغييرات** again.
6. Run a manual backup to verify: click **نسخ احتياطي الآن** (Backup Now). A success toast confirms it, and the backup tab shows the time and status of the last backup.

## 2. Backup and Recovery

### Restoring on a Replacement Computer

Scenario: the original office computer is lost, stolen, or broken. You have a `.qdb` backup file and the association transfer key.

1. Install the application on the new computer.
2. Launch the app. Complete the first-run setup with a **temporary** superadmin account (any strong password).
3. Log in as that temporary superadmin.
4. Open **الإعدادات** → tab **النسخ الاحتياطي**.
5. Click **استيراد قاعدة بيانات محلية** (Import Local Database) and select the `.qdb` backup file.
6. A dialog **الخطوة الأخيرة: تأكيد الهوية** appears:
   - Password field («أدخل كلمة المرور الخاصة بك»): enter the password of the account you are **logged in with now** — the temporary superadmin. It confirms your identity on this computer.
   - Backup code field («رمز النسخة الاحتياطية (اتركه فارغاً إذا كان غير مطلوب)»): enter the **association transfer key** that was set when the backup was made.
   - Click **تأكيد** (Confirm).
7. On success, a toast reads: «تم استيراد قاعدة البيانات بنجاح! سيتم إعادة تشغيل التطبيق لتطبيق التغييرات.» and the app restarts.
8. The restored database replaces everything, including the user accounts: the temporary superadmin no longer exists. Log in with an account from the backup.
9. Set the association transfer key and a backup folder again on this computer if they are not already shown in the backup tab, and make a fresh backup.

### What Is Lost Without the Transfer Key

- Backups created **without** an association transfer key are encrypted with the source computer's database key (stored in the OS keychain / key file).
- If that computer is gone, the key is gone. The `.qdb` files cannot be decrypted on any other machine.
- Only backups made **after** the transfer key was set and saved can be restored on a different computer.

## 3. Rotating the Database Key

### When to Rotate

- You suspect the computer or its OS keychain / key file was copied (e.g. device left unattended, disk imaged).
- A staff member with Superadmin or Administrator access leaves the association.
- As a periodic hygiene measure (e.g. annually).

### Prerequisites

- You are logged in as **Superadmin**.
- The **رمز النقل الموحد للمؤسسة** (Association Transfer Key) is already set and saved in Settings → النسخ الاحتياطي. The rotation is refused until this is done, because backups made without it depend on the old database key and would become unrestorable.
- You know the current superadmin password.

### Steps

1. Open **إعدادات النظام والنسخ الاحتياطي** → tab **النسخ الاحتياطي**.
2. Scroll to the section **مفتاح تشفير قاعدة البيانات**.
3. Click **تغيير مفتاح التشفير** (Rotate Encryption Key).
4. A modal **تأكيد تغيير مفتاح التشفير** appears with the body: «أدخل كلمة المرور الخاصة بك لإعادة تشفير قاعدة البيانات بمفتاح جديد. سيتم تسجيل خروج جميع المستخدمين.»
5. Enter your superadmin password and click **تأكيد** (Confirm).
6. The app re-keys the database (crash-safe: if the app crashes mid-operation, the next start finishes or discards the rotation).
7. All sessions are ended immediately. A toast reads: «تم تغيير مفتاح تشفير قاعدة البيانات. يرجى تسجيل الدخول من جديد.»
8. Every user must log in again. The new session tokens are signed with a secret derived from the new database key.

### Consequences

- The database file is re-encrypted with a fresh 32-byte key.
- The session-signing secret (JWT secret) is re-derived from the new key via HKDF-SHA256.
- All active sessions are revoked (force-logout).
- Backups made **after** rotation use the new key. Backups made **before** rotation (and encrypted with the association transfer key) remain restorable because the transfer key is independent of the database key.
- Backups made before rotation **without** the transfer key are now useless (they were encrypted with the old database key, which no longer exists).

## 4. Incident Response Checklist

### Suspected Unauthorized Access or Data Copy

1. **Contain**
   - Change the affected user's password in **إدارة المستخدمين** → select user → **تعديل** → set a new strong password.
   - Deactivate compromised accounts: in **إدارة المستخدمين**, set status to **غير نشط** (Inactive). Inactive users cannot log in.
   - If the database file or the key store may have been copied, change the association transfer
     key (and make a fresh backup) and rotate the database key (Section 3). Rotation protects the
     database from now on; it cannot make an already copied file plus its copied key unreadable.

2. **Preserve Evidence**
   - Copy the log file `app-logs.txt` from the app's user-data folder (on Windows usually
     `%APPDATA%\QuranBranchManager\app-logs.txt`).
   - Fields named like passwords, tokens, secrets, transfer keys and national IDs are redacted in
     the log.

3. **Assess Data Integrity**
   - If data may have been altered, restore from a known-good backup (Section 2).
   - Verify student, teacher, financial, and user records after restore.

4. **Notify**
   - Inform the association's leadership (regional/national) of the incident and actions taken.

5. **Report Software Vulnerabilities**
   - If the incident was caused by a software vulnerability (not operational mishandling), report it per [SECURITY.md](../../SECURITY.md): email elheni.selim@gmail.com privately, never a public issue.

### Lost or Stolen Computer

The stolen computer keeps its own database key; nothing done on another computer changes that.
Its database is protected by the Windows account (the key is sealed with the OS) and by the
users' passwords.

1. Set up a replacement computer and restore the latest backup (Section 2).
2. On the replacement, change the passwords of every account (they may be guessed offline on the
   stolen copy), then choose a **new association transfer key**, save it, rotate the database key
   (Section 3) and make a fresh backup. Backups made with the old transfer key should be treated as
   readable by whoever has the stolen computer.
3. Tell the other branch computers that share the old transfer key to change it as well.
4. Notify the association's leadership.

### Forgotten Superadmin Password

There is no back door.

- **If another Superadmin account exists:** that Superadmin resets the password in
  **إدارة المستخدمين** → the user → **تعديل** → new password.
- **Otherwise:** the only way back is a backup in which you know a Superadmin password — install
  the app on a clean user profile or computer, create a temporary superadmin, and restore that
  backup (Section 2). Keep at least two Superadmin accounts to avoid this.

Do not attempt to manipulate the database file directly; it is encrypted and integrity-checked.

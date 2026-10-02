# Security Runbook

Operational procedures for branch staff and maintainers. UI labels are quoted exactly as they appear in the Arabic interface.

## 1. Setting Up a New Branch Computer

1. Install the application (run the Windows installer from the GitHub release).
2. Launch the app. The first-run setup screen appears.
3. Create the first superadmin account:
   - Username: choose a unique identifier.
   - Password: at least 6 characters and not a common password. The form shows the rule «6 أحرف على الأقل؛ يمكنك استخدام الحروف أو الأرقام فقط أو اختيار كلمة مرور أكثر تعقيداً. تجنب كلمات المرور الشائعة.» A longer password is safer.
   - **رمز حماية النسخ الاحتياطية** (backup protection key, also called the association transfer key), typed twice: the shared secret that encrypts backups so any computer of the association can restore them. At least 8 characters and different from the password. If the association already uses a key on another computer, enter **the same key**. Save it securely (password manager, printed copy in a safe).
   - Click «إنشاء مدير النظام» (Create system administrator).
4. Log in with the new superadmin account.
5. Open **الإعدادات** in the sidebar (page «إعدادات النظام والنسخ الاحتياطي»), tab «النسخ الاحتياطي»:
   - **مسار حفظ النسخ الاحتياطي**: click «اختيار...» and pick an absolute, existing, writable folder (e.g. `D:\Backups\QuranBranch`). The scheduler will not start without a valid path.
   - The card **رمز حماية النسخ الاحتياطية (رمز النقل)** shows «تم تعيين الرمز»: the key chosen at setup. It is never shown on screen unless the Superadmin clicks «عرض الرمز» and types their password (it hides again after 30 seconds).
   - Enable **تفعيل النسخ التلقائي** (Enable Automatic Backup), choose **تكرار النسخ** (Frequency: يوميًا / أسبوعيًا / شهريًا) and **توقيت النسخ** (Time, e.g. 02:00).
   - Click **حفظ جميع التغييرات** again.
6. Run a manual backup to verify: click **نسخ احتياطي الآن** (Backup Now). A success toast confirms it, and the backup tab shows the time and status of the last backup.

## 2. Backup and Recovery

### Restoring on a Replacement Computer

Scenario: the original office computer is lost, stolen, or broken. You have a `.qdb` backup file and the association transfer key.

1. Install the application on the new computer.
2. Launch the app. Complete the first-run setup with a **temporary** superadmin account (any strong password) and, as backup protection key, **the association transfer key**.
3. Log in as that temporary superadmin.
4. Open **الإعدادات** → tab **النسخ الاحتياطي**.
5. In the section **استرجاع نسخة احتياطية**, click **استرجاع من نسخة احتياطية...** (Restore from a backup) and select the `.qdb` backup file.
6. A dialog **الخطوة الأخيرة: تأكيد الهوية** appears:
   - Password field («أدخل كلمة المرور الخاصة بك»): enter the password of the account you are **logged in with now** — the temporary superadmin. It confirms your identity on this computer.
   - Backup key field («رمز حماية النسخ الاحتياطية (اتركه فارغاً إذا كانت النسخة مشفّرة بالرمز المحفوظ هنا)»): leave it empty when the backup was made with the key entered at setup. Type a key only for a backup made with a different one (for example the key used before it was changed).
   - Click **تأكيد** (Confirm).
7. On success, a toast reads: «تم استيراد قاعدة البيانات بنجاح! سيتم إعادة تشغيل التطبيق لتطبيق التغييرات.» and the app restarts.
8. The restored database replaces everything, including the user accounts: the temporary superadmin no longer exists. Log in with an account from the backup.
9. The restored database brings its own backup protection key. Check the backup tab shows «تم تعيين الرمز», set a backup folder, and make a fresh backup.

### What Is Lost Without the Transfer Key

- New installs choose the transfer key at setup, so their backups never depend on one computer. An older install without a key asks its Superadmin for one after login; that prompt cannot be skipped.
- Backups made by an older install **before** it had a transfer key are encrypted with that computer's database key (stored in the OS keychain / key file).
- If that computer is gone, the key is gone. Those `.qdb` files cannot be decrypted on any other machine.

## 3. Showing or Changing the Backup Protection Key

Only the **Superadmin** can do this; other roles see only whether a key is set. The database
encryption key itself is automatic and never shown or changed by staff.

1. Open **إعدادات النظام والنسخ الاحتياطي** → tab **النسخ الاحتياطي**, card **رمز حماية النسخ الاحتياطية (رمز النقل)**.
2. To see the key: click **عرض الرمز**, type your password and click **تأكيد**. The key is shown for 30 seconds, or until you click **إخفاء**.
3. To change it: click **تغيير الرمز**, type your password, then the new key twice, and click **حفظ الرمز**.

When you change it:

- New backups (manual and automatic) use the new key at once.
- Older backups stay encrypted with the old key: to restore one, type the old key in the restore dialog. Keep the old key as long as you keep those backups.
- Give the new key to the other computers of the association, so they can still restore each other's backups.

## 4. Incident Response Checklist

### Suspected Unauthorized Access or Data Copy

1. **Contain**
   - Change the affected user's password in **إدارة المستخدمين** → select user → **تعديل** → set a new strong password.
   - Deactivate compromised accounts: in **إدارة المستخدمين**, set status to **غير نشط** (Inactive). Inactive users cannot log in.
   - If backups or the key may have been copied, change the association transfer key (Section 3)
     and make a fresh backup. This protects new backups; it cannot make already copied backups
     unreadable to someone who has the old key.

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
   stolen copy), then choose a **new association transfer key** (Section 3) and make a fresh
   backup. Backups made with the old transfer key should be treated as
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

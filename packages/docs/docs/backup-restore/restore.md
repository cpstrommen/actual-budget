# Restoring Backups

## Restoring a Manual Backup

If you previously followed the [steps](./backup.md) to back up your data and have an Actual CFM
zip export, you can restore this backup by importing it using the Import File button in the Switch File page.

### Steps to Restore a Backup:

1. Close your current budget by clicking on the budget name in the top left
   corner of the screen and choosing the option to _Switch file_.

   <img width="224" alt="The budget name menu with Switch file highlighted" src="/img/backup-restore/restore-switch-file@2x.webp" />

2. In the _Budget Selection Screen_, or File Screen that appears, click on _Import file_.

   <img width="511" alt="The list of budget files with the Import file button highlighted" src="/img/backup-restore/restore-import-file@2x.webp" />

3. Choose the _Actual CFM / Actual Budget_ import format.

   <img width="512" alt="The Import From dialog with the Actual CFM option highlighted" src="/img/backup-restore/restore-import-source@2x.webp" />

4. Then click on the _Select file..._ button.

   <img width="512" alt="The Import from Actual CFM export dialog with the Select file button highlighted" src="/img/backup-restore/restore-import-actual@2x.webp" />

5. Navigate to the location of where you stored your backup file, select it and click
   on the _upload button_.

   ![Choosing the backup zip file in the system file dialog](/img/backup-restore/restore-import-file-choose-file.webp)

That is it. The backup is now restored. If the imported budget is a copy
of your current budget, you may want to rename the import by clicking on its name
and rename it. Once you verify the new imported budget is correct, you can
navigate back to the budget selection screen by closing the current budget
and deleting the old copy.

<img width="511" alt="The list of budget files showing the imported copy below the original budget" src="/img/backup-restore/restore-imported-budget@2x.webp" />

## Errors When Restoring Database From Backup

You may encounter an error during restoration that says:

`This budget cannot be loaded with this version of the app. Make sure the app is up-to-date.`

This indicates a version/schema compatibility problem, including importing a newer or nightly budget into an older build. Keep the original archive and working installation unchanged, and test a copy with a compatible application version.

Do not delete or insert migration records or manually apply SQL to make the version check pass. A successful version check alone would not prove that the application's expected schema and financial data agree.

For upstream imports, follow [Migrating from Actual Budget](../migration/from-actual-budget.md). For the reverse direction, use [Export for Actual Budget](../migration/return-to-actual-budget.md), which constructs and validates a clean database for its pinned upstream target. Replacing a CFM image with an upstream image against the same live data directory is not a supported downgrade procedure.

## Automatic Backups

:::caution
Automatic backups are currently only available in the desktop app.
:::

Actual CFM keeps backups of your data locally. If something disastrous happens, you can always load a recent backup to regain your data.

Currently, it keeps up to 10 backups, one for each you used the app, and multiple backups of the current day. The result is you will have data backed up **up to the last 15 minutes**, in addition to the previous 10 days you used the app.

### Loading an Automatic Backup

- Select the **File > Load Backup…** menu item
- Choose the backup you want to load and select it

The app will reload with the data from that backup. If you want to keep using that backup, you don't have to do anything else; keep using the app. If you wish to return to the previous data, reopen the backup menu and select **Revert to original version**. This option will be available until another backup is made.

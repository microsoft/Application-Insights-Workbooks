# Bring your own storage to save Workbooks

There are times when you may have a query or some business logic that you want to secure. Workbooks provides an option to secure the workbook by saving the workbook content to your storage. The storage account can then be encrypted with Microsoft-managed keys or you can manage the encryption by supplying your own keys. [See Azure documentation on Storage Service Encryption.](https://docs.microsoft.com/en-us/azure/storage/common/storage-service-encryption)

## Saving Workbook with Managed Identities

1. Before you can save the workbook to your storage, you'll need to create a managed identity (All Services -> Managed Identities) and give it `Storage Blob Data Contributor` access to your storage account. [See Azure documentation on Managed Identities.](https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/how-to-manage-ua-identity-portal) ![Image showing adding a role assignment](../Images/ByosAddIdentityRoleAssignment.png)
2. Create a new workbook.
3. Click on the Save button as before to save the workbook.
4. There's an option to `Save content to an Azure Storage Account`, click on the checkbox to save to an Azure Storage Account.
    ![Image showing a the saved dialog](../Images/ByosSavedDialogDefault.png)
5. Select the desire Storage account and Container. The Storage account list is from the Subscription selected above.
    ![Image showing a save dialog with storage option](../Images/ByosSaveDialogWithStorage.png)
6. Then click on `Change` to select a managed identity previously created
![Image showing change identity dialog](../Images/ByosChangeManagedIdentity.png)
7. After you've selected your storage options, press `Save` to save your workbook.

## Limitations
+ When saving to custom storage, you cannot pin individual parts of the workbook to a dashboard, as the individual pins would contain protected information in the dashboard itself.  When using custom storage, you can only pin links to the workbook itself to dashboards.
+ Once a workbook has been saved to custom storage, it will always be saved to custom storage and this cannot be turned off. To save elsewhere, you can use "Save As" and elect to not save the copy to custom storage.
+ Workbooks in Application Insights resource are "legacy" workbooks and does not support custom storage. The lastest Workbooks in Application Insights resource is the "...More" selection. Lecacy worbooks don't have Subscription options when saving.
  + ![Image showing legacy workbook](../Images/ByosLegacyWorkbooks.png)
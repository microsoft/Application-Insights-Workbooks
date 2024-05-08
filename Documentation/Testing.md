# How to test your changes

Testing changes to a template can be done in two primary ways:

1. [**Using Advanced Mode**](#using-advanced-mode): Works locally in your browser, exclusively for you.
2. [**Redirecting to a GitHub Branch**](#redirecting-the-gallery-to-a-github-branch): Allows anyone with the URL to test changes temporarily; slightly more complicated but widely accessible.

## Using Advanced Mode
If you're only modifying a workbook, you can test your changes locally without any usage of Git. Follow these steps:

1. **Create an empty workbook.**
2. **Access Advanced Mode.**
3. **Paste the contents of the `.workbook` template file into Advanced Mode.**
4. **Click on the `Apply` button.**

> [!TIP]
> If your template content is valid, it will appear in the view. If not, you'll receive an error notification explaining why your content is invalid.

## Redirecting the Gallery to a GitHub Branch

To test changes in an existing template without merging to master or altering galleries, you can use the `feature.workbookGalleryBranch` setting. This setting instructs the Workbooks view to fetch content from a specific GitHub branch for testing purposes. Other users can also view these changes.

### Steps:

1. **Make Changes to Your Branch**: Implement the desired modifications on your branch.
   
2. **Push to GitHub**: Once changes are made, push the branch to your GitHub repository.
   
3. **Update Portal URL**: Append `?feature.workbookGalleryBranch=[name of branch]` to the portal URL. For example: `https://portal.azure.com/?feature.workbookGalleryBranch=master`.
   
If this worked, a banner will display in the gallery indicating the redirection.

### Limitations:

- **Performance**: Loading workbooks from GitHub may slow down loading times and lead to throttling errors if too many items are loaded in a short succession of time.
  
> [!IMPORTANT]
> This feature flag is intended for short-term testing and not as a permanent solution.

### Uploading package content
There are 2 ways to host your built packages. Choose one of them.

1. **Setting up a storage account to deploy your package**

    By setting up a storage account to host your changes, you can share the portal link outlined in step 7 with other team members or create a private previews with select customers.
    1. Create azure storage account
    2. In that storage account create blob container, like "azure_monitor_workbook_templates"
    3. In that storage account, [enable CORS rules](https://docs.microsoft.com/en-us/rest/api/storageservices/cross-origin-resource-sharing--cors--support-for-the-azure-storage-services) so your machine will be able to read from that storage account
    4. In that storage account, [configure public access](https://docs.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure?tabs=portal) to enable unauthenticated access to that storage account.
    5. Upload contents of `outputs\package` directory to the blob container (so you now have a path like `azure_monitor_workbook_templates/package` in the storage account)
    - The [Microsoft Azure Storage Explorer](https://azure.microsoft.com/en-us/features/storage-explorer/#features) allows you to upload entire directories directly to the container.
    6. Get the url to that folder; it will be something like `https://[name of storage account].blob.core.windows.net/azure_monitor_workbook_templates/package`
    - At this point, attempt to navigate directly to that folder url from a browser to make sure you have the right settings. (note that navigating directly will not test CORS, only access from the portal will)
    7. Set that as a feature flag setting on the portal url. the feature flag will be `feature.workbookGalleryRedirect=[your url]`
    - You'll end up with something like `https://portal.azure.com/?feature.workbookGalleryRedirect=https://[yourblob].blob.core.windows.net/azure_monitor_workbook_templates/package`
    8. Test this in the portal. Ensure you have no network errors in the network console, this is where you will see CORS related errors about missing headers if CORS is not enabled.
    9. As you make changes to your templates, rebuild the package and re-upload changed content.

2. **Running a local web server**

    If you are already running something like Apache or IIS locally and you don't intend on sharing your changes, you can upload built package to your web server.
    1. Use your web server settings to expose the `outputs\package` folder as readable.  Ensure it is available via HTTPS, and ensure that CORS is enabled to allow loading that url from the portal.
    2. Set that as a feature flag setting on the portal url. the feature flag will be `feature.workbookGalleryRedirect=[your url]`
    - so you'll end up with something like `https://portal.azure.com/?feature.workbookGalleryRedirect=https://localhost/package`
    3. Test this in the portal. Ensure you have no network errors in the network console, this is where you will see CORS related errors about missing headers if CORS is not enabled.
    4. As you make changes to your templates, rebuild the package and re-upload changed content.

### Troubleshooting deployed gallery
1. How do I know if content is being served from my gallery?
    - Press on `F12` or `Ctrl+Shift+I` to bring up the developer console.
    - Switch to the network tab, and filter to your storage container name or local web server name
    - Navigate to a workbook gallery (For example: Azure Monitor -> Workbooks)
    - Inspect that the gallery file loaded is from your own gallery
    ![Troubleshooting image](./Images/TestDeployTroubleshooting.png)

2. After making changes, running the processDevPackage.cmd, and uploading the contents to my gallery, I don't see my changes.
    - Press on `F12` or `Ctrl+Shift+I` to bring up the developer console.
    - Switch to the network tab
    - Ensure that the checkbox 'Disabled cache' is checked
    - With the developer console still open, refresh the gallery, and you should see your changes



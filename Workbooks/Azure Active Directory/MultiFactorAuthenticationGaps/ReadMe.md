# Multi Factor Authentication Gaps Workbook
## What is this workbook?
This workbook helps in identifying user sign-ins and applications that are not protected by multi-factor authentication requirements.
* Identifies user sign-ins not protected by multi-factor authentication requirement and provides further drill down using various pivots such as by applications, by operating systems and by location.
* Provides several filters such as trusted locations, device states, to narrow down the users/applications. 
* Provides filters to scope the workbook for a subset of users and applications.

## Workbook Prerequisites
To use Azure Active Directory Monitor workbooks, you need: 
* An Azure Active Directory tenant with a premium (P1 or P2) license. [Learn how to get a premium license.](https://learn.microsoft.com/en-us/azure/active-directory/fundamentals/active-directory-get-started-premium) 
* A Log Analytics workspace. [Learn how to create a log analytics workspace.](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/quick-create-workspace)
* [Access to the log analytics workspace](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access?tabs=portal#azure-rbac).
* To access workbooks in Azure Active Directory, you must have access to the underlying Log Analytics workspace and be assigned to one of the following roles: 
  * Global Reader 
  * Reports Reader 
  * Security Reader 
  * Application Administrator 
  * Cloud Application Administrator 
  * Company Administrator 
  * Security Administrator  

## Widgets of the workbook
### Summary
The summary widget provides the total numer of sign-ins and the number of sign-ins that are not protected by MFA requirement and the number of sign-ins protected by MFA requirement.

### Sign-ins not protected by MFA requirement by applications
These widgets show user sign-ings that are not protected by MFA requirement by applications.
* Number of users signing-in not protected by multi-factor authentication requirement by application: This widget provides a time based bar-graph representation of the number of user sign-ins not protected by MFA requirement by applications.
* Percent of users signing-in not protected by multi-factor authentication requirement by application: This widget provides a time based bar-graph representation of the precentage of user sign-ins not protected by MFA requirement by applications.
* Select an application and user to learn more: This widget groups the top users signed in with out MFA requirement by application. By selecting the application, it will list the user names and the count of sign-ins without MFA.

### Sign-ins not protected by MFA requirement by users
These widgets show users with most sign-ins not protected by MFA requirement.
* Signins not protected by multi-factor auth requirement by user: This widget shows top user and the count of sign-ins not protected by MFA requirement.
* Top users with high percentage of auths not protected by multi-factor authentication requirements: This widget shows users with top percentage of auths that are not protected by MFA requirements.

### Sign-ins not protected by MFA requirement by Operating Systems
These widgets show sign-ins not protected by MFA by operation system.
* Number of signins not protected by multi-factor authentication requirement by operating system: This widget provides time based bar graph of sign-in counts that are not prtected by MFA by operating system of the devices.
* Percent of signins not protected by multi-factor authentication requirement by operating system: This widget provides time based bar graph of sign-in percentage that are not prtected by MFA by operating system of the devices.

### Sign-ins not protected by MFA requirement by locations
These widgets show sign-ins not protected by MFA by location.
* Number of sign-ins not protected by multi-factor authentication requirement by location: This widget shows the sign-ins counts that are not protected by MFA requirement in map bubble chart on the world map. 

## How to import the workbook?
1. Go to Azure Active Directory in Azure Portal using this link - https://aad.portal.azure.com
2. Navigate to **Workbooks** under **Monitoring** section by selecting the menu options in the side pane.

<img src=".\Images\Workbooks.jpg" alt="Workbooks" title="Azure Active Directory Workbooks" style="display: block; margin: 0 auto"/>

3. Hit "New" workbook, which opens an editor window for the workbook.

<img src=".\Images\New Workbook.jpg" alt="Workbooks" title="Add New Workbook" style="display: block; margin: 0 auto"/>

4. Click the Advanced Editor buton which opens up a JSON editor.

<img src=".\Images\Workbook Advanced Editor.jpg" alt="Workbooks" title="Workbook Advanced Editor Option" style="display: block; margin: 0 auto"/>

5. Copy the Multi-Factor Authentication Gaps workbook JSON from the GitHub repository and paste to replace all the contents in the JSON editor.

6. Use Save As option to save the workbook as a new version and provide a new title name and select appropriate Subscription, Resource Groups and Location and Hit Apply.

<img src=".\Images\Workbook Save As.jpg" alt="Workbooks" title="Workbook Save As Option" style="display: block; margin: 0 auto"/>
<br/>
<img src=".\Images\Workbook Save As Title.jpg" alt="Workbooks" title="Workbook Save As Title" style="display: block; margin: 0 auto"/>
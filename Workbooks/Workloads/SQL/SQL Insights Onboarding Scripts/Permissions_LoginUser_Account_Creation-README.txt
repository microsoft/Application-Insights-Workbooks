Brief Description ==>
	
	+ This script provides a mechanism to create login (in master database) and user (in user databases) for a given set of databases for allowing telegraf to monitor the databases.
	+ It currently supports a scenario where there's only one server admin credentials for all the servers/databases to be acted upon.
	+ It allows selecting a database type for which the login/user is being created or updated. The possible options are VM-DB for SQL VM, MI-DB for SQL Managed Instance and AZ-DB for Azure SQL Database or Elastic Pools.

Mandatory Parameters ==> 

	+ -DatabaseType "<choose_option_from_VM-DB_or_MI-DB_or_AZ-DB>"
	+ -KeyVaultNameToSaveTo "<key_vault_to_save_credentials_to>" 
	+ -OutputLogFolder "<folder_path_to_store_logs_and_output_files>"

Authentication Parameters (choose one of the 4 options) ==>

	+ Sql Auth with credentials as parameters
		-SqlAuth ==> use flag when SQL authentication should be used to connect to server with server credentials provided as parameters
		-AdminUserId "<actual_admin_id>" 
		-AdminPassKey "<actual_admin_password>"
	
	+ Sql Auth with credentials from KeyVault
		-SqlAuthWithKeyvault ==> use flag when SQL authentication should be used to connect to server with server credentials retrieved from a keyvault
		-SqlAuthKeyvaultName "<key_vault_where_server_credentials_are_stored>" 
		-SqlAuthKVAdminUserIdSecretName "<key_vault_secret_name_for_admin_id>" 
		-SqlAuthKVAdminPassKeySecretName "<key_vault_secret_name_for_admin_password>"
	
	+ Aad Auth
		-AadAuth ==> use flag when AAD based authentication should be used to connect to server

	+ No Auth provided
		When none of the above authentication flags are provided, user would prompted to enter the server credentials via console prompt

Server/Databases Parameters (choose one of the 2 options) ==>

	+ Databases list provided
		-Databases <comma separated list of servername/database combinations, / is required to signify the combination>

	+ Find databases for given subscription and resource group [NOTE: This option is only supported for database type "AZ-DB", so for "VM-DB" and "MI-DB" use list of databases only]
		-SubscriptionId "<subscription_id_where_the_servers_exist>" 
		-ResourceGroupName "<resource_group_name_where_the_servers_exist>"

Known Constraints ==>

	+ Identifying SQLServer instance and databases within a subscription/resource group is only supported Azure SQL Databases and Elastic Pools (AZ-DB). For other database types (i.e. VM-DB and MI-DB), use the database list as the input parameter.
	+ User running the script should make sure their client machine has access to the relevant Azure resources. For example, client IP address might have to be allow-listed for Azure SQL Databases.
	+ If using AAD Auth, AAD Admin should be set appropriately to access the corresponding Azure resources/databases.
	+ While connecting to SQL MI, using it's public endpoint is the easiest way to connect, unless the client where the script is running can access the private endpoint within SQL MI instance's VNET.
	+ For SQL VM, use IP addresses as server name in case the server name itself does not get identified at the client machine where the script is being run.

Examples ==>

+ For Azure SQL Databases - No Auth with list of databases

.\Permissions_LoginUser_Account_Creation.ps1 
-Databases myserver01/database01, myserver01/database02, myserver02/database03
-DatabaseType "AZ-DB"
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"


+ For Azure SQL Databases - Sql Auth with credentials as params and list of databases

.\Permissions_LoginUser_Account_Creation.ps1 
-Databases myserver01/database01, myserver01/database02, myserver02/database03
-DatabaseType "AZ-DB"
-SqlAuth 
-AdminUserId "myserveradmin"
-AdminPassKey "myserverpwd@01"
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"


+ For Azure SQL Databases - Sql Auth with credentials from keyvault and list of databases

.\Permissions_LoginUser_Account_Creation.ps1 
-Databases myserver01/database01, myserver01/database02, myserver02/database03
-DatabaseType "AZ-DB"
-SqlAuthWithKeyvault 
-SqlAuthKeyvaultName "mykeyvault01"
-SqlAuthKVAdminUserIdSecretName "serveradminsecret"
-SqlAuthKVAdminPassKeySecretName "serverpwdsecret"
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"


+ For Azure SQL Databases - Aad Auth with list of databases

.\Permissions_LoginUser_Account_Creation.ps1 
-Databases myserver01/database01, myserver01/database02, myserver02/database03
-DatabaseType "AZ-DB"
-AadAuth 
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"


+ For Azure SQL Databases - Aad Auth with subscription and resource group for finding server/databases

.\Permissions_LoginUser_Account_Creation.ps1 
-SubscriptionId "620754ef-4a56-8b7e-bf48-e9c934db5fe3"
-ResourceGroupName <name of the resource group where the servers with databases should be found> 
-DatabaseType "AZ-DB"
-AadAuth 
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"

+ For Azure SQL Managed Instance (MI) - Sql Auth with credentials from keyvault and list of databases (** All the AZ-DB examples are applicable for MI as well, this example is only to show relevant changes required)

.\Permissions_LoginUser_Account_Creation.ps1 
-Databases myserver01.public.a347b71e37c5/database01, myserver01.public.a347b71e37c5/database02, myserver02.public.b821e77a61d7/database03
-DatabaseType "MI-DB"
-SqlAuthWithKeyvault 
-SqlAuthKeyvaultName "mykeyvault01"
-SqlAuthKVAdminUserIdSecretName "serveradminsecret"
-SqlAuthKVAdminPassKeySecretName "serverpwdsecret"
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"

+ For Azure SQL VM - Sql Auth with credentials from keyvault and list of databases (** All the AZ-DB examples are applicable for VM as well, this example is only to show relevant changes required)

.\Permissions_LoginUser_Account_Creation.ps1 
-Databases 10.101.101.1/database01, 10.101.101.1/database02, 10.101.101.2/database03
-DatabaseType "VM-DB"
-SqlAuthWithKeyvault 
-SqlAuthKeyvaultName "mykeyvault01"
-SqlAuthKVAdminUserIdSecretName "serveradminsecret"
-SqlAuthKVAdminPassKeySecretName "serverpwdsecret"
-KeyVaultNameToSaveTo "mykeyvault01"
-OutputLogFolder "C:\MyFolder\ScriptLogs"
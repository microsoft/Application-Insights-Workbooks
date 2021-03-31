<#
This script provides a mechanism to create login (in master database) and user (in user databases) for a given set of databases for allowing telegraf to monitor the databases.
It currently supports a scenario where there's only one server admin credentials for all the servers/databases to be acted upon.

For further details, please go through Permissions_LoginUser_Account_Creation-README.txt.
#>

Param(
    [string]$SubscriptionId,

    [string]$ResourceGroupName,
    
    [string[]]$Databases,

    [Parameter(Mandatory=$true)]
    [ValidateSet("VM-DB","MI-DB","AZ-DB")]
    [string]$DatabaseType,

    [switch]$AadAuth,
    
    [switch]$SqlAuth,

    [string]$AdminUserId,

    [string]$AdminPassKey,

    [switch]$SqlAuthWithKeyvault,

    [string]$SqlAuthKeyvaultName,

    [string]$SqlAuthKVAdminUserIdSecretName,

    [string]$SqlAuthKVAdminPassKeySecretName,

    [Parameter(Mandatory=$true)]
    [string]$KeyVaultNameToSaveTo,

    [Parameter(Mandatory=$true)]
    [string]$OutputLogFolder
)

$fileSuffix = "{0:yyyyMMdd}-{0:HHmmss}" -f (Get-Date)
$logFilePath = $OutputLogFolder + '\PermScript_Log_'+ $fileSuffix +'.log'
$successFilePath = $OutputLogFolder + '\PermScript_SuccessList_'+ $fileSuffix +'.txt'
$failureFilePath = $OutputLogFolder + '\PermScript_FailureList_'+ $fileSuffix +'.txt'
$connStringsFilePath = $OutputLogFolder + '\PermScript_ConnStringList_'+ $fileSuffix +'.txt'
$logMessageList = New-Object System.Collections.Generic.List[System.Object]

$sql_script_for_login = @"
EXECUTE('IF EXISTS(SELECT * FROM sys.sql_logins WHERE name = ''' + @loginname + ''')
    BEGIN
        DROP LOGIN [' + @loginname + ']
    END')
EXECUTE ('CREATE LOGIN [' + @loginname + '] WITH PASSWORD = ''' + @password + '''')
"@

$sql_script_for_user = @"
EXECUTE ('IF EXISTS(SELECT * FROM sys.database_principals WHERE name = ''' + @username + ''')
    BEGIN
        DROP USER [' + @username + ']
    END')
EXECUTE ('CREATE USER [' + @username + '] FOR LOGIN [' + @loginname + ']')
"@

Function GenerateStrongPassword ([Parameter(Mandatory=$true)][int]$PasswordLength){
    Add-Type -AssemblyName System.Web
    $PassComplexCheck = $false
    do {
        $newPassword=[System.Web.Security.Membership]::GeneratePassword($PasswordLength,1)
        If ( ($newPassword -cmatch "[A-Z\p{Lu}\s]") `
        -and ($newPassword -cmatch "[a-z\p{Ll}\s]") `
        -and ($newPassword -match "[\d]") `
        -and ($newPassword -match "[^\w]")
        ){
            $PassComplexCheck=$True
        }
    } While ($PassComplexCheck -eq $false)
    return $newPassword
}

Function GetCurrentTimeStamp {
    return "[{0:yyyy-MM-dd} {0:HH:mm:ss}]" -f (Get-Date)
}

Function WriteToConsoleAndLogFile ([Parameter(Mandatory=$true)][string]$Message){
    Write-Host $Message
    $logMessageList.Add($(GetCurrentTimeStamp) + " " + $Message)

    # Write-Output "$(GetCurrentTimeStamp) $Message" | Out-file $logFilePath -append
}

WriteToConsoleAndLogFile("Updating login/user creation script based on database type...")

# update login/user creation scripts based on the input database type
# Azure SQL VM and Azure SQL MI allow creating a login with server state permission
# Azure SQL Database and Azure SQL Elastic Pool databases only allow database state permission
if($DatabaseType -eq "AZ-DB") {
    $sql_script_for_user = $sql_script_for_user + @"

EXECUTE ('GRANT VIEW DATABASE STATE TO [' + @username + ']')
"@
} else {
    $sql_script_for_login = $sql_script_for_login + @"

EXECUTE ('GRANT VIEW SERVER STATE TO [' + @loginname + ']')
EXECUTE ('GRANT VIEW ANY DEFINITION TO [' + @loginname + ']')
"@
}

WriteToConsoleAndLogFile("Updated login/user creation script for database type = " + $DatabaseType)

# test if output folder exists and log file can be created
WriteToConsoleAndLogFile("Validating output log folder path...")

if(-not (Test-Path -Path $OutputLogFolder -PathType Container)){
    # throw exception
    throw 'Output Log Folder does not exist'
} else {
    # create an empty log file
    try{
        [io.file]::OpenWrite($OutputLogFolder + '\PermScript_Log_Test.test').close()
    } catch {
        # throw exception
        Write-Warning "Unable to write to output log folder"
        WriteToConsoleAndLogFile($_)
        throw 'Could not create log file in Output Log Folder'
    }

    WriteToConsoleAndLogFile("Output log folder path is accessible")
}

# check for authentication mechanism and get servers creds ready
WriteToConsoleAndLogFile("Checking authentication mechanism...")

if ($AadAuth) {
    WriteToConsoleAndLogFile("You have selected AadAuth authentication mechanism - connection would be via Active Directory intergrated authentication")
} else {
    if ($SqlAuthWithKeyvault) {
        if ( ([string]::IsNullOrEmpty($SqlAuthKeyvaultName)) -or ([string]::IsNullOrEmpty($SqlAuthKVAdminUserIdSecretName)) -or ([string]::IsNullOrEmpty($SqlAuthKVAdminPassKeySecretName)) ){
            # throw exception
            throw 'You have selected SqlAuthWithKeyvault authentication mechanism, this requires SqlAuthKeyvaultName, SqlAuthKVAdminUserIdSecretName and SqlAuthKVAdminPassKeySecretName to be provided'
        } else {
            # get creds from KV
            try{
                $AdminUserIdSecret = Get-AzKeyVaultSecret -VaultName $SqlAuthKeyvaultName -Name $SqlAuthKVAdminUserIdSecretName
                $AdminPassKeySecret = Get-AzKeyVaultSecret -VaultName $SqlAuthKeyvaultName -Name $SqlAuthKVAdminPassKeySecretName

                $BSTR_UserId = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminUserIdSecret.SecretValue)            
                $AdminUserId = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR_UserId)

                $BSTR_PassKey = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassKeySecret.SecretValue)            
                $AdminPassKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR_PassKey)
            } catch {
                # throw exception
                WriteToConsoleAndLogFile($_)
                throw 'You have selected SqlAuthWithKeyvault authentication mechanism, however we encountered retrieving credentials from the Keyvault -- '
            }

            WriteToConsoleAndLogFile("You have selected SqlAuthWithKeyvault authentication mechanism - server credentials found")
        }
    } elseif ($SqlAuth) { 
        if ((([string]::IsNullOrEmpty($AdminUserId)) -or ([string]::IsNullOrEmpty($AdminPassKey)))){
            # throw exception
            throw 'You have selected SqlAuth authentication mechanism, this requires AdminUserId and AdminPassKey to be provided'
        }

        WriteToConsoleAndLogFile("You have selected SqlAuth authentication mechanism - server credentials found")
    } else {
        WriteToConsoleAndLogFile("You have not selected an authentication mechanism - defaulting to Sql Auth - server credentials required via prompt")
        $AdminUserId = Read-Host "Enter server admin user name - "
        $AdminPassKeySecure = Read-Host -AsSecureString "Enter server admin password - "
        $BSTR_PassKey = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassKeySecure)
        $AdminPassKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR_PassKey)
    }
}

# Name of the login to be created at a server level
$loginname = 'telegraf'

# Prefix for login password's secret name to be stored in keyvault
$loginpasswordsecretnameprefix = 'telegraflogin-'

# Name of the user to be created at a database level
$username = 'telegrafuser'


$SuccessList = New-Object System.Collections.Generic.List[System.Object]
$FailureList = New-Object System.Collections.Generic.List[System.Object]
$ConfigConnectionStringList = New-Object System.Collections.Generic.List[System.Object]
$server_list = @{}
$success_server_count = 0
$failure_server_count = 0
$partial_server_count = 0
$success_database_count = 0
$failure_database_count = 0
[bool] $isDatabaseListDefined = 0

if ($SubscriptionId -ne '' -and $SubscriptionId -ne $null -and $ResourceGroupName -ne '' -and $ResourceGroupName -ne $null) {
    # Subscription and ResourceGroup has been provided

    try {
        Connect-AzAccount

        # Set subscription 
        Set-AzContext -SubscriptionId $SubscriptionId
    } catch {
        # throw exception
        WriteToConsoleAndLogFile($_)
        throw 'Exception occurred while connecting to Azure account or set subscription context'
    }

    WriteToConsoleAndLogFile("Connected to Azure subscription = " + $SubscriptionId)

    try {
        # Get resource group
        $resourceGroup = Get-AzResourceGroup -Name $ResourceGroupName

        WriteToConsoleAndLogFile("Retrieving server list from resource group = " + $resourceGroup.ResourceGroupName + " from subscription = " + $subscriptionId)

        $serverList = Get-AzSqlServer -ResourceGroupName $resourceGroup.ResourceGroupName
    } catch {
        # throw exception
        WriteToConsoleAndLogFile($_)
        throw 'Exception occurred while retrieving resource group or server list from the resource group'
    }

    $isDatabaseListDefined = 0
    WriteToConsoleAndLogFile("Server list created")
    
} elseif ($Databases.count -gt 0) {
    # Subscription and ResourceGroup has NOT been provided, but Databases list has been provided

    # parse the Databases string array with create a nested hashtable of servers and corresponding databases
    foreach ($ds in $Databases){
        $ds_split = $ds.Split("/");
    
        if($server_list.ContainsKey($ds_split[0])){
            $val_hash = $server_list[$ds_split[0]]
            if(!$val_hash.ContainsKey($ds_split[1])){
                $val_hash[$ds_split[1]] = 1
                $server_list[$ds_split[0]] = $val_hash
            }
        } else {
            $val_hash = @{ $ds_split[1] = 1 }
            $server_list[$ds_split[0]] = $val_hash
        }
    }

    $serverList = $server_list.Keys
    $isDatabaseListDefined = 1
    WriteToConsoleAndLogFile("Server and Database list created")
} else {
    # Subscription and ResourceGroup has been NOT provided, and Databases list is also NOT provided, hence throw error
    throw 'Either Subscription and ResourceGroup have to provided, OR, Database list has to be provided'
}

WriteToConsoleAndLogFile("Displaying server/database list...")
$serverList | Format-Table -AutoSize

WriteToConsoleAndLogFile("Looping through list of servers...")

foreach ($server in $serverList) {
    if ($isDatabaseListDefined -eq 0) {
        $serverName = $server.ServerName
    } else {
        $serverName = $server
    }

    WriteToConsoleAndLogFile("Executing for server name = " + $serverName)

    # generate password for the login to be created at server level
    $password = GenerateStrongPassword (10)

    $loginpasswordsecretname = $loginpasswordsecretnameprefix + $serverName
    $loginpasswordsecretname = $loginpasswordsecretname -replace "[.]", "-"

    WriteToConsoleAndLogFile("Saving secret to KeyVault...")

    # save password to keyvault
    try{
        $secret = ConvertTo-SecureString -String $password -AsPlainText -Force
        Set-AzKeyVaultSecret -VaultName $KeyVaultNameToSaveTo -Name $loginpasswordsecretname -SecretValue $secret | Out-Null
    } catch {
        # log failure at server level - could not save to key vault - no databases under this server would be accessed
        WriteToConsoleAndLogFile("Failure for Server Name = " + $serverName + " -- Error while saving login account password to keyvault " + $KeyVaultNameToSaveTo + " -- None of the databases under this server would be accessed")
        WriteToConsoleAndLogFile($_)

        # add to failure list
        $FailureList.Add("Failure for Server Name = " + $serverName + " -- Error while saving login account password to keyvault " + $KeyVaultNameToSaveTo)

        continue
    }

    WriteToConsoleAndLogFile("Saved secret to KeyVault")

    WriteToConsoleAndLogFile("Server = " + $serverName + " -- Login = " + $loginname + " -- Creating login with randomly generated password...")

    $serverNameFull = "tcp:$($serverName).database.windows.net,1433"
    
    if($DatabaseType -eq "VM-DB") {
        $serverNameFull = "$($serverName);TrustServerCertificate=True"
    } elseif ($DatabaseType -eq "MI-DB" -and $serverName -like '*.public.*') {
        $serverNameFull = "tcp:$($serverName).database.windows.net,3342"
    }

    try{
        if ($AadAuth) {
            $connectionString = "Server=$($serverNameFull);Initial Catalog=master;Authentication=Active Directory Integrated;"
        } else {
            $connectionString = "Server=$($serverNameFull);Initial Catalog=master;Persist Security Info=False;User ID=$AdminUserId;Password=$AdminPassKey;MultipleActiveResultSets=False;Encrypt=True;Connection Timeout=30;"
        }
        
        $connection = New-Object -TypeName System.Data.SqlClient.SqlConnection($connectionString)

        $command = New-Object -TypeName System.Data.SqlClient.SqlCommand($sql_script_for_login, $connection)

        $param_loginname = New-Object -TypeName System.Data.SqlClient.SqlParameter("@loginname", $loginname)
        $param_password = New-Object -TypeName System.Data.SqlClient.SqlParameter("@password", $password)

        $command.Parameters.Add($param_loginname) | Out-Null
        $command.Parameters.Add($param_password) | Out-Null

        $reply = Read-Host -Prompt "For server = $serverName, login = $loginname would be dropped and recreated with appropriate permissions. Do you want to continue?[y/n]"
        if ($reply -notmatch "[yY]") { 
            throw "Login creation for login = $loginname aborted as per input provided"
        }

        $connection.Open()

        $command.ExecuteNonQuery() | Out-Null
        $connection.Close()
    } catch {
        # log failure at server level - could not create/re-create login - no databases under this server would be accessed
        WriteToConsoleAndLogFile("Failure for Server Name = " + $serverName + " -- Error while creating login account in the server -- None of the databases under this server would be accessed")
        WriteToConsoleAndLogFile($_)

        # add to failure list
        $FailureList.Add("Failure for Server Name = " + $serverName + " -- Error while creating login account in the server")

        continue
    }

    WriteToConsoleAndLogFile("Server = " + $serverName + " -- Login = " + $loginname + " -- Created login with randomly generated password")

    # add to success list
    $SuccessList.Add("Success for Server Name = " + $serverName + " -- Login account created in the database and Login account password saved in keyvault " + $KeyVaultNameToSaveTo)
    $ConfigConnectionStringList.Add("For Server Name = " + $serverName + ", Database Name = master ==> " + $connectionString + "app name=telegraf;log=1;")

    if ($isDatabaseListDefined -eq 0) {
        # find all databases for the current server
        $database_list = Get-AzSqlDatabase -ResourceGroupName $resourceGroup.ResourceGroupName -ServerName $server.ServerName
    } else {
        # use user-provided db list corresponding to the server
        $database_list = $server_list[$server].Keys
    }

    WriteToConsoleAndLogFile("Displaying list of databases for the server - ")

    $database_list | Format-Table -AutoSize

    WriteToConsoleAndLogFile("Looping through list of databases for the server " + $serverName + " ...")

    foreach ($database in $database_list){
        if ($isDatabaseListDefined -eq 0) {
            $databaseName = $database.DatabaseName
        } else {
            $databaseName = $database
        }

        if($databaseName -eq 'master'){
            WriteToConsoleAndLogFile("Database name = " + $databaseName + " -- No action required")
            continue
        } else {
            WriteToConsoleAndLogFile("Database name = " + $databaseName + " -- Connecting to database for adding user for login...")
        }
        
        try{
            if ($AadAuth) {
                $connectionString = "Server=$($serverNameFull);Initial Catalog=$($databaseName);Authentication=Active Directory Integrated;"
            } else {
                $connectionString = "Server=$($serverNameFull);Initial Catalog=$($databaseName);Persist Security Info=False;User ID=$AdminUserId;Password=$AdminPassKey;MultipleActiveResultSets=False;Encrypt=True;Connection Timeout=30;"
            }
            $connection = New-Object -TypeName System.Data.SqlClient.SqlConnection($connectionString)

            $command = New-Object -TypeName System.Data.SqlClient.SqlCommand($sql_script_for_user, $connection)

            $param_username = New-Object -TypeName System.Data.SqlClient.SqlParameter("@username", $username)
            $param_loginname = New-Object -TypeName System.Data.SqlClient.SqlParameter("@loginname", $loginname)
        
            $command.Parameters.Add($param_username) | Out-Null
            $command.Parameters.Add($param_loginname) | Out-Null

            $reply = Read-Host -Prompt "For server = $serverName, database name = $databaseName, user = $username would be dropped and recreated with appropriate permissions. Do you want to continue?[y/n]"
            if ($reply -notmatch "[yY]") { 
                throw "User creation for user = $username aborted as per input provided"
            }
        
            $connection.Open()
            $command.ExecuteNonQuery() | Out-Null
            $connection.Close()
        } catch {
            # log failure at database level - could not create/re-create user
            WriteToConsoleAndLogFile("Failure for Server Name = " + $serverName + ", Database Name = " + $databaseName + " -- Error while creating user in the database")
            WriteToConsoleAndLogFile($_)

            # add to failure list
            $FailureList.Add("Failure for Server Name = " + $serverName + ", Database Name = " + $databaseName + " -- Error while creating user in the database")

            continue
        }

        WriteToConsoleAndLogFile("Database = " + $databaseName + " - user = " + $username + " - Added for login = " + $loginname)
        
        # add to success list
        $SuccessList.Add("Success for Server Name = " + $serverName + ", Database Name = " + $databaseName + " -- User account created in the database")
        $ConfigConnectionStringList.Add("For Server Name = " + $serverName + ", Database Name = " + $databaseName + " ==> " + $connectionString + "app name=telegraf;log=1;")
    }

    WriteToConsoleAndLogFile("Reached end of list of databases for the server " + $serverName)
}

WriteToConsoleAndLogFile("Reached end of list of servers")

WriteToConsoleAndLogFile("`r`nSUCCESS List")
if($SuccessList.Count -gt 0){
    $SuccessList
    Out-File -FilePath $successFilePath -InputObject $SuccessList
} else {
    WriteToConsoleAndLogFile("No records in Success list")
}

WriteToConsoleAndLogFile("`r`nFAILURE List")
if($FailureList.Count -gt 0){
    $FailureList
    Out-File -FilePath $failureFilePath -InputObject $FailureList
} else {
    WriteToConsoleAndLogFile("No records in Failure list")
}

WriteToConsoleAndLogFile("`r`nCONFIG CONNECTION STRING List")
if($ConfigConnectionStringList.Count -gt 0){
    $ConfigConnectionStringList
    Out-File -FilePath $connStringsFilePath -InputObject $ConfigConnectionStringList
} else {
    WriteToConsoleAndLogFile("No records in Config Connection String list")
}

# Generating log file - this includes all the Write-Host comments and success/failure records
Out-File -FilePath $logFilePath -InputObject $logMessageList
Write-Host "`r`nLog file created - " $logFilePath

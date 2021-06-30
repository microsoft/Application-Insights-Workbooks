param(
[Parameter(Mandatory=$true)]
[string]$storageRG,
[Parameter(Mandatory=$true)]
[string]$storageName,
[Parameter(Mandatory=$true)]
[string]$storageContainer,
[Parameter(Mandatory=$true)]
[string]$deploymentRG,
[string]$templatesLocation = (Get-Location)
)

Set-Location $templatesLocation

$sa = Get-AzStorageAccount -ResourceGroupName $storageRG -Name $storageName
Get-ChildItem -Filter "*.json" | Set-AzStorageBlobContent -Container $storageContainer -Context ($sa.Context) -Force
$mainTemplateLink = (Get-AzStorageBlob -Context $sa.Context -Container $storageContainer -Blob 'deploy.json').ICloudBlob.uri.AbsoluteUri

#-ApiVersion '2020-06-01' `
New-AzResourceGroupDeployment -ResourceGroupName $deploymentRG `
    -TemplateUri $mainTemplateLink `
    -storageLink (Get-AzStorageContainer -Name $storageContainer -Context $sa.Context).CloudBlobContainer.StorageUri.PrimaryUri.AbsoluteUri
param([Parameter(Mandatory=$true)][string]$BackupRoot, [switch]$Initialize)
$ErrorActionPreference = 'Stop'
try {
  $ResolvedRoot = [IO.Path]::GetFullPath($BackupRoot)
  if ($ResolvedRoot -notmatch '^[A-Za-z]:\\' -or $ResolvedRoot -eq [IO.Path]::GetPathRoot($ResolvedRoot)) { throw 'path' }
  $Drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($ResolvedRoot))
  if ($Drive.DriveType -ne [IO.DriveType]::Fixed -or $Drive.DriveFormat -ne 'NTFS') { throw 'drive' }
  $Cursor = $ResolvedRoot
  while ($Cursor) {
    if (Test-Path -LiteralPath $Cursor) { if ((Get-Item -LiteralPath $Cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse' } }
    $Cursor = [IO.Path]::GetDirectoryName($Cursor)
  }
  $OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $SystemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  if ($Initialize) {
    if (Test-Path -LiteralPath $ResolvedRoot) { throw 'exists' }
    $null = [IO.Directory]::CreateDirectory($ResolvedRoot)
    $Acl = [Security.AccessControl.DirectorySecurity]::new()
    $Acl.SetOwner($OwnerSid); $Acl.SetAccessRuleProtection($true, $false)
    foreach ($Sid in @($OwnerSid, $SystemSid)) {
      $Rule = [Security.AccessControl.FileSystemAccessRule]::new($Sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
      $null = $Acl.AddAccessRule($Rule)
    }
    Set-Acl -LiteralPath $ResolvedRoot -AclObject $Acl
  }
  if (-not (Test-Path -LiteralPath $ResolvedRoot -PathType Container)) { throw 'missing' }
  $Items = @((Get-Item -LiteralPath $ResolvedRoot -Force)) + @(Get-ChildItem -LiteralPath $ResolvedRoot -Force -Recurse)
  foreach ($Item in $Items) {
    if ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse' }
    $Acl = Get-Acl -LiteralPath $Item.FullName
    if ($Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $OwnerSid.Value) { throw 'owner' }
    $Allowed = @($OwnerSid.Value, $SystemSid.Value); $OwnerAllowed = $false
    foreach ($Rule in $Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      if ($Rule.AccessControlType -ne 'Allow' -or $Allowed -notcontains $Rule.IdentityReference.Value) { throw 'permissions' }
      if ($Rule.IdentityReference.Value -eq $OwnerSid.Value -and ($Rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $OwnerAllowed = $true }
    }
    if (-not $OwnerAllowed) { throw 'permissions' }
  }
  Write-Output 'PRIVATE_STORAGE_OK'
} catch { [Console]::Error.WriteLine('Private local NTFS storage validation failed. No data was displayed.'); exit 1 }

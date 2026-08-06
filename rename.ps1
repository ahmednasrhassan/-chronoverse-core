$dir = "src/components/archive"
Get-ChildItem $dir | ForEach-Object {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($_.Name)
  Write-Output ($_.Name + " => " + [System.BitConverter]::ToString($bytes))
}

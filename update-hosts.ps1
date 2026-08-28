# Update hosts file for Supabase pooler region
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$newEntry = "52.77.146.31 aws-0-ap-southeast-1.pooler.supabase.com"

# Remove old supabase entries and add new one
$hostsContent = Get-Content $hostsPath | Where-Object { $_ -notmatch "pooler.supabase.com" }
$hostsContent += $newEntry
Set-Content -Path $hostsPath -Value $hostsContent -Force

Write-Host "Updated hosts file"
Get-Content $hostsPath | Select-String "supabase"

# Add Supabase pooler to hosts file
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$entry = "52.45.94.125 aws-0-us-east-1.pooler.supabase.com"

# Check if entry already exists
$currentContent = Get-Content $hostsPath -Raw
if ($currentContent -notmatch [regex]::Escape("aws-0-us-east-1.pooler.supabase.com")) {
    Add-Content -Path $hostsPath -Value "`n$entry"
    Write-Host "Added entry to hosts file"
} else {
    Write-Host "Entry already exists in hosts file"
}

# Verify
Get-Content $hostsPath | Select-String "supabase"

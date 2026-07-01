$srcPath = "C:\Users\jakub\Desktop\project\src"
$files = Get-ChildItem -Path $srcPath -Recurse -Include "*.tsx","*.ts" | Where-Object { $_.Name -notlike "*InstallationGuide*" }
foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    if ($content -match "localhost:3001") {
        $newContent = $content -replace "http://localhost:3001/api", "/api"
        $newContent = $newContent -replace "http://localhost:3001", ""
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "Fixed: $($file.Name)"
    }
}
Write-Host "Done"

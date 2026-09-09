$csharpCode = @"
using System;
using System.IO;
using System.IO.Compression;
using System.Xml;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

public class ExcelDbSync
{
    public class RowData
    {
        public string Question = "";
        public string Answer = "";
        public string Category = "";
        public string Tags = "";
        public string Source = "";
        public string Confidence = "";
    }

    public static List<RowData> ParseXlsx(string xlsxPath)
    {
        List<string> sharedStrings = new List<string>();
        List<RowData> rows = new List<RowData>();

        using (FileStream fs = new FileStream(xlsxPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        using (ZipArchive zip = new ZipArchive(fs, ZipArchiveMode.Read))
        {
            ZipArchiveEntry ssEntry = zip.GetEntry("xl/sharedStrings.xml");
            if (ssEntry != null)
            {
                using (Stream ssStream = ssEntry.Open())
                using (XmlReader reader = XmlReader.Create(ssStream))
                {
                    StringBuilder sb = new StringBuilder();
                    bool inSi = false;
                    bool inT = false;

                    while (reader.Read())
                    {
                        if (reader.NodeType == XmlNodeType.Element)
                        {
                            if (reader.LocalName == "si")
                            {
                                inSi = true;
                                sb.Length = 0;
                            }
                            else if (inSi && reader.LocalName == "t")
                            {
                                inT = true;
                            }
                        }
                        else if (reader.NodeType == XmlNodeType.Text)
                        {
                            if (inT)
                            {
                                sb.Append(reader.Value);
                            }
                        }
                        else if (reader.NodeType == XmlNodeType.EndElement)
                        {
                            if (reader.LocalName == "t")
                            {
                                inT = false;
                            }
                            else if (reader.LocalName == "si")
                            {
                                inSi = false;
                                sharedStrings.Add(sb.ToString());
                            }
                        }
                    }
                }
            }

            ZipArchiveEntry sheetEntry = zip.GetEntry("xl/worksheets/sheet1.xml");
            if (sheetEntry != null)
            {
                using (Stream sheetStream = sheetEntry.Open())
                using (XmlReader reader = XmlReader.Create(sheetStream))
                {
                    RowData currentRow = null;
                    string currentCol = "";
                    string cellType = "";
                    string cellVal = "";
                    bool inV = false;

                    while (reader.Read())
                    {
                        if (reader.NodeType == XmlNodeType.Element)
                        {
                            if (reader.LocalName == "row")
                            {
                                currentRow = new RowData();
                            }
                            else if (reader.LocalName == "c")
                            {
                                string r = reader.GetAttribute("r");
                                if (r == null) r = "";
                                currentCol = Regex.Replace(r, "[0-9]", "");
                                cellType = reader.GetAttribute("t");
                                if (cellType == null) cellType = "";
                                cellVal = "";
                            }
                            else if (reader.LocalName == "v")
                            {
                                inV = true;
                            }
                        }
                        else if (reader.NodeType == XmlNodeType.Text)
                        {
                            if (inV)
                            {
                                cellVal = reader.Value;
                            }
                        }
                        else if (reader.NodeType == XmlNodeType.EndElement)
                        {
                            if (reader.LocalName == "v")
                            {
                                inV = false;
                            }
                            else if (reader.LocalName == "c")
                            {
                                string text = "";
                                int sIdx = 0;
                                if (cellType == "s" && int.TryParse(cellVal, out sIdx))
                                {
                                    if (sIdx >= 0 && sIdx < sharedStrings.Count)
                                    {
                                        text = sharedStrings[sIdx];
                                    }
                                }
                                else
                                {
                                    text = cellVal;
                                }

                                if (currentRow != null)
                                {
                                    if (currentCol == "A") currentRow.Question = text;
                                    else if (currentCol == "B") currentRow.Answer = text;
                                    else if (currentCol == "C") currentRow.Category = text;
                                    else if (currentCol == "D") currentRow.Tags = text;
                                    else if (currentCol == "E") currentRow.Source = text;
                                    else if (currentCol == "F") currentRow.Confidence = text;
                                }
                            }
                            else if (reader.LocalName == "row")
                            {
                                if (currentRow != null && (!string.IsNullOrEmpty(currentRow.Question) || !string.IsNullOrEmpty(currentRow.Answer)))
                                {
                                    rows.Add(currentRow);
                                }
                            }
                        }
                    }
                }
            }
        }
        return rows;
    }
}
"@

Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies "System.IO.Compression", "System.Xml"

$projectRoot = (Get-Location).Path
$databaseDir = Join-Path $projectRoot "database"
$xlsxItem = Get-ChildItem -Path $databaseDir -Filter "*.xlsx" | Select-Object -First 1

if (-not $xlsxItem) {
    Write-Host "找不到 Excel 檔案！"
    exit 1
}

$xlsxFile = $xlsxItem.FullName
Write-Host "正在同步最新 Excel 檔案：$xlsxFile ..."
$rawRows = [ExcelDbSync]::ParseXlsx($xlsxFile)

if ($rawRows.Count -le 1) {
    Write-Host "Excel 為空！"
    exit 0
}

$dataRows = $rawRows | Select-Object -Skip 1

$knownCategories = @("住院前", "住院中", "出院", "文件申請", "服務設施", "服務電話", "您好/你好")
$items = [System.Collections.Generic.List[PSObject]]::new()
$categoriesSet = [System.Collections.Generic.HashSet[string]]::new()

$idx = 1
foreach ($r in $dataRows) {
    $q = $r.Question.Trim()
    $a = $r.Answer.Trim()
    if ([string]::IsNullOrWhiteSpace($q) -and [string]::IsNullOrWhiteSpace($a)) {
        continue
    }

    $rawCategory = $r.Category.Trim()
    $tagList = @()
    if (-not [string]::IsNullOrWhiteSpace($r.Tags)) {
        $parsedTags = $r.Tags -split '[,，、]' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
        if ($parsedTags) {
            $tagList = @($parsedTags)
        }
    }

    # 智能判斷所屬主要分類
    $cat = $rawCategory
    if ([string]::IsNullOrWhiteSpace($cat) -or $cat -eq "一般問答") {
        $matchedCat = $knownCategories | Where-Object { $tagList -contains $_ } | Select-Object -First 1
        if ($matchedCat) {
            $cat = $matchedCat
        } elseif ([string]::IsNullOrWhiteSpace($cat)) {
            $cat = "一般問答"
        }
    }

    $categoriesSet.Add($cat) | Out-Null

    $src = $r.Source.Trim()
    if ([string]::IsNullOrWhiteSpace($src)) {
        $src = "雙和醫院衛教題庫"
    }

    $conf = 0.95
    if (-not [string]::IsNullOrWhiteSpace($r.Confidence)) {
        [double]::TryParse($r.Confidence, [ref]$conf) | Out-Null
    }

    $idStr = "kb-1150120-" + ($idx.ToString("D3"))
    $items.Add([PSCustomObject]@{
        id = $idStr
        question = $q
        answer = $a
        category = $cat
        tags = @($tagList)
        source = $src
        confidence = $conf
    })
    $idx++
}

# 確保標準分類順序
$defaultCatOrder = @("住院前", "住院中", "出院", "文件申請", "服務設施", "服務電話", "您好/你好", "一般問答")
$categoriesList = [System.Collections.Generic.List[string]]::new()
foreach ($dc in $defaultCatOrder) {
    if ($categoriesSet.Contains($dc)) {
        $categoriesList.Add($dc)
    }
}
foreach ($c in $categoriesSet) {
    if (-not $categoriesList.Contains($c)) {
        $categoriesList.Add($c)
    }
}

$nowIso = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$versionStamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$dbObject = [PSCustomObject]@{
    id = "db_1150120"
    name = "🏥 雙和醫療服務知識庫 (1150120)"
    description = "雙和醫院住院、門診、服務設施與文件申請常見問題解答。"
    categories = $categoriesList
    createdAt = "2026-01-20"
    updatedAt = $nowIso
    version = $versionStamp
    isDefault = $true
    items = $items
}

$jsonPath = Join-Path $databaseDir "知識庫_1150120.json"
$jsonContent = $dbObject | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($jsonPath, $jsonContent, [System.Text.Encoding]::UTF8)

$jsPath = Join-Path $databaseDir "databases.js"
$jsContent = @"
/**
 * 後台資料庫聚合載入器 (Database Loader)
 * 存放於 database/ 資料夾中，供網頁啟動時自動載入各資料庫
 * 自動同步時間：$nowIso
 */

const LOCAL_FOLDER_DATABASES = {
  "db_1150120": $jsonContent
};

// 全域導出供網頁直接讀取
if (typeof window !== "undefined") {
  window.DEFAULT_DATABASES = LOCAL_FOLDER_DATABASES;
  window.DEFAULT_DATABASES_VERSION = $versionStamp;
}
"@

[System.IO.File]::WriteAllText($jsPath, $jsContent, [System.Text.Encoding]::UTF8)

Write-Host "========================================================"
Write-Host "  ✅ 知識庫同步完成！"
Write-Host "  📊 成功轉換 $($items.Count) 筆最新問答資料"
Write-Host "  📁 分類清單: $($categoriesList -join ', ')"
Write-Host "  📝 更新時間: $nowIso"
Write-Host "========================================================"
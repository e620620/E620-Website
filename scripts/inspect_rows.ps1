$csharpCode = @"
using System;
using System.IO;
using System.IO.Compression;
using System.Xml;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

public class ExcelInspector
{
    public class RowData
    {
        public string ColA = "";
        public string ColB = "";
        public string ColC = "";
        public string ColD = "";
        public string ColE = "";
        public string ColF = "";
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
                                    if (currentCol == "A") currentRow.ColA = text;
                                    else if (currentCol == "B") currentRow.ColB = text;
                                    else if (currentCol == "C") currentRow.ColC = text;
                                    else if (currentCol == "D") currentRow.ColD = text;
                                    else if (currentCol == "E") currentRow.ColE = text;
                                    else if (currentCol == "F") currentRow.ColF = text;
                                }
                            }
                            else if (reader.LocalName == "row")
                            {
                                if (currentRow != null)
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

$xlsxFile = "C:\Users\ireg\Desktop\智能問答助手-勿刪\database\知識庫_1150120.xlsx"
$rows = [ExcelInspector]::ParseXlsx($xlsxFile)

Write-Host "Row 0 (Header): A='$($rows[0].ColA)', B='$($rows[0].ColB)', C='$($rows[0].ColC)', D='$($rows[0].ColD)', E='$($rows[0].ColE)', F='$($rows[0].ColF)'"

for ($i = 1; $i -le 10; $i++) {
    $r = $rows[$i]
    Write-Host "Row $i => A='$($r.ColA)', C='$($r.ColC)', D='$($r.ColD)', E='$($r.ColE)'"
}
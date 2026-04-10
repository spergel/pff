const fs = require('fs');

const fileMappings = [
  ['src/app/flows/page.tsx',                       [['fmt', 'fmtDollar']]],
  ['src/app/overlap/page.tsx',                     [['fmtDollar', 'fmtDollar']]],
  ['src/app/page.tsx',                             [['fmtDollar', 'fmtDollar'], ['fmtNum', 'fmtNum']]],
  ['src/app/predictions/page.tsx',                 [['fmt', 'fmtDollar']]],
  ['src/app/security/page.tsx',                    [['fmtDollar', 'fmtDollar'], ['fmtNum', 'fmtNum']]],
  ['src/components/ConsensusTable.tsx',            [['fmtDollar', 'fmtDollar']]],
  ['src/components/EtfSummaryStrip.tsx',           [['fmtDollar', 'fmtDollar']]],
  ['src/components/FlowChart.tsx',                 [['fmtDollar', 'fmtDollar']]],
  ['src/components/FlowsTable.tsx',                [['fmt', 'fmtNum'], ['fmtDollar', 'fmtDollar']]],
  ['src/components/HoldingsTable.tsx',             [['fmtNum', 'fmtNum'], ['fmtDollar', 'fmtDollar']]],
  ['src/components/OpportunitiesTable.tsx',        [['fmtDollar', 'fmtDollar'], ['fmtNum', 'fmtNum']]],
  ['src/components/SectorFlowChart.tsx',           [['fmtDollar', 'fmtDollar']]],
  ['src/components/trends/DailyActivityTable.tsx', [['fmtM', 'fmtDollar']]],
  ['src/components/trends/PressureLeaderboard.tsx',[['fmtM', 'fmtDollar']]],
  ['src/components/trends/SectorRotation.tsx',     [['fmtM', 'fmtDollar']]],
];

for (const [file, mappings] of fileMappings) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  // Remove all Intl.NumberFormat declarations (handles multiline blocks)
  src = src.replace(/const \w+\s*=\s*new Intl\.NumberFormat\([\s\S]*?\}\);\n?/g, '');

  // Replace oldVar.format( with newFn(
  for (const [oldVar, newFn] of mappings) {
    const escaped = oldVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped + '\\.format\\(', 'g');
    src = src.replace(re, newFn + '(');
  }

  // Build import line
  const fnsNeeded = [...new Set(mappings.map(([, fn]) => fn))].sort().join(', ');
  const importLine = 'import { ' + fnsNeeded + ' } from "@/src/lib/fmt";\n';

  // Insert after the last consecutive import line at top of file
  src = src.replace(/^((?:["']use client["'];\n\n?)?(?:import[^\n]*\n)*)/, function(match) {
    return match + importLine;
  });

  if (src !== orig) {
    fs.writeFileSync(file, src);
    console.log('updated:', file);
  } else {
    console.log('no change:', file);
  }
}
console.log('done');

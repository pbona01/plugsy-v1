import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace(/if \(requestingUser\.publicMetadata\?\.role !== "admin"\) \{[\s\S]*?return res\.status\(403\).json\(\{ error: "Forbidden" \}\);[\s\S]*?\}/g, '');
content = content.replace(/if \(requestingUser\.publicMetadata\?\.role !== "admin"\) return res\.status\(403\)\.json\(\{ error: "Forbidden" \}\);/g, '');

fs.writeFileSync('server.ts', content);
console.log("Replaced admin checks");

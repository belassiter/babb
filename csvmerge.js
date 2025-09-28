/* script to import two CSV files, merge them based on a common column, and output the result as a JSON file. no longer needed */
const fs = require('fs');
const path = require('path');

function parseCSV(csvData) {
    const lines = csvData.trim().split('\r\n');
    const headers = lines[0].split(',');

    const data = lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        const entry = {};
        headers.forEach((header, i) => {
            entry[header] = values[i];
        });
        return entry;
    });

    return data;
}

const data1Path = path.join(__dirname, 'source-data-1.csv');
const data2Path = path.join(__dirname, 'source-data-2.csv');

const data1 = parseCSV(fs.readFileSync(data1Path, 'utf-8'));
const data2 = parseCSV(fs.readFileSync(data2Path, 'utf-8'));

const data2Map = new Map();
data2.forEach(row => {
    data2Map.set(row.Number, row);
});

const mergedData = data1.map(row1 => {
    const row2 = data2Map.get(row1.Number);
    if (row2) {
        const { Title, ...restOfRow2 } = row2;
        return { ...row1, ...restOfRow2 };
    }
    return row1;
});

const outputPath = path.join(__dirname, 'merged-data.json');
fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));

console.log('Merged data written to merged-data.json');

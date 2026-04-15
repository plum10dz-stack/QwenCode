
import fs from 'fs';
import path from 'path';

function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');

    if (!fs.existsSync(envPath)) return;

    const envFile = fs.readFileSync(envPath, 'utf-8');
    const lines = envFile.split('\n').filter((line: string) => line.trim() && !line.startsWith('#'));

    lines.forEach((line: string) => {
        const delimiterIndex = line.indexOf('=');
        if (delimiterIndex <= 0) return;

        const key = line.slice(0, delimiterIndex).trim();
        let value = line.slice(delimiterIndex + 1).trim();

        // Remove wrapping quotes if they exist ("value" or 'value')
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else {
            // Only attempt casting if the value was NOT wrapped in quotes.
            // (If a user writes PORT="3000", they explicitly want it as a string).
            value = <any>castValue(value);
        }

        //if (!process.env.hasOwnProperty(key)) {
        process.env[key] = value;
        //}
    });
}

function castValue(val: string) {
    // 1. Check for Boolean
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;

    // 2. Check for Number (Only if it doesn't start with 0, to prevent "0123" from becoming "83" in octal)
    if (/^-?\d+$/.test(val) && (val.length === 1 || val[0] !== '0')) {
        return parseInt(val, 10);
    }

    // Check for Floating Point Numbers
    if (/^-?\d+\.\d+$/.test(val)) {
        return parseFloat(val);
    }

    // 3. Check for Date (Matches YYYY-MM-DD or ISO 8601 formats)
    if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const parsedDate = new Date(val);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
        }
    }

    // 4. Fallback to String
    return val;
}

loadEnv();
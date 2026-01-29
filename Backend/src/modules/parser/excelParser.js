const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

class ExcelParser {
  constructor() {
    this.requiredColumns = ['Nome', 'Telefone'];
    // Valid International Format (Brazil): 55 + 2-digit Area Code + 8 or 9 digit number
    this.phoneRegex = /^55\d{10,11}$/;
  }

  /**
   * Parses an Excel or CSV file and retrieves valid contacts.
   * @param {string} filePath - Absolute path to the file.
   * @param {string} originalFilename - Original filename to detect extension.
   * @returns {Promise<{contacts: Array, errors: Array}>}
   */
  async parse(filePath, originalFilename) {
    const workbook = new ExcelJS.Workbook();
    const validContacts = [];
    const errors = [];

    try {
      logger.info(`Starting parser for: ${filePath}`);

      // Auto-detect format based on extension (check original name first)
      const isCsv = (originalFilename && originalFilename.toLowerCase().endsWith('.csv')) || 
                    filePath.toLowerCase().endsWith('.csv');

      if (isCsv) {
        await workbook.csv.readFile(filePath);
      } else {
        await workbook.xlsx.readFile(filePath);
      }

      const worksheet = workbook.getWorksheet(1); // Get first sheet
      
      if (!worksheet) {
        throw new Error('Workbook is empty or cannot be read.');
      }

      // Map Headers
      const headerRow = worksheet.getRow(1);
      const columnMap = {};
      const headersFound = [];

      headerRow.eachCell((cell, colNumber) => {
        const headerValue = cell.value ? cell.value.toString().trim() : '';
        if (headerValue) {
          columnMap[headerValue] = colNumber;
          headersFound.push(headerValue);
        }
      });

      // Validate Required Columns
      const missingColumns = this.requiredColumns.filter(col => !columnMap[col]);
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}. Found: ${headersFound.join(', ')}`);
      }

      // Iterate Rows (Data starts at row 2)
      let processedRows = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        try {
          // Extract Data
          const rawName = this._getCellValue(row, columnMap['Nome']);
          const rawPhone = this._getCellValue(row, columnMap['Telefone']);
          
          if (!rawName && !rawPhone) {
             // Empty row, skip silently or log distinct debug
             return; 
          }

          // Validation
          const validation = this._validateRow(rawName, rawPhone);

          if (validation.isValid) {
            // Extract optional dynamic variables (all other columns)
            const variables = {};
            Object.keys(columnMap).forEach(header => {
              if (!this.requiredColumns.includes(header)) {
                variables[header] = this._getCellValue(row, columnMap[header]);
              }
            });

            validContacts.push({
              row: rowNumber,
              name: rawName,
              phone: validation.cleanPhone,
              ...variables
            });
          } else {
            errors.push({
              row: rowNumber,
              error: validation.error,
              data: { name: rawName, phone: rawPhone }
            });
          }

          processedRows++;
        } catch (rowError) {
          errors.push({
            row: rowNumber,
            error: `Unexpected Parsing Error: ${rowError.message}`
          });
        }
      });

      logger.info(`Parsing complete. Processed: ${processedRows}. Valid: ${validContacts.length}. Errors: ${errors.length}.`);
      return { contacts: validContacts, errors };

    } catch (error) {
      logger.error(`Fatal Parser Error: ${error.message}`);
      throw error;
    }
  }

  _getCellValue(row, colNumber) {
    if (!colNumber) return '';
    const cell = row.getCell(colNumber);
    // ExcelJS Text/Value handling
    return cell.text ? cell.text.trim() : (cell.value ? cell.value.toString().trim() : '');
  }

  _validateRow(name, phone) {
    if (!name) {
      return { isValid: false, error: 'Missing Name' };
    }
    if (!phone) {
      return { isValid: false, error: 'Missing Phone' };
    }

    const cleanPhone = this._sanitizePhone(phone);
    if (!this.phoneRegex.test(cleanPhone)) {
      return { isValid: false, error: `Invalid Phone Format: ${cleanPhone}. Expected 55DDD9XXXXXXXX` };
    }

    return { isValid: true, cleanPhone };
  }

  _sanitizePhone(phone) {
    let clean = phone.replace(/\D/g, ''); // Remove non-digits
    
    // Auto-fix common issues if needed (Day 1 requirement: Sanitization)
    // If user enters '11999998888', assume 55
    if ((clean.length === 10 || clean.length === 11) && !clean.startsWith('55')) {
       clean = '55' + clean;
    }

    return clean;
  }
}

module.exports = ExcelParser;

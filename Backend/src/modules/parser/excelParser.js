const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const { readCsvFile } = require('./csvParser');
const { sanitizePhone, isValidPhone } = require('../utils/phone');

class ExcelParser {
  constructor() {
    this.requiredColumns = ['nome', 'telefone'];
    this.headerAliases = {
      nome: ['nome', 'name'],
      telefone: ['telefone', 'phone', 'celular', 'whatsapp']
    };
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
        const rows = readCsvFile(filePath);
        if (rows.length === 0) {
          throw new Error('CSV is empty or cannot be read.');
        }

        const headerRow = rows[0];
        const headerMap = this._mapHeaders(headerRow);
        this._validateHeaders(headerMap, headerRow);

        let processedRows = 0;
        rows.slice(1).forEach((row, index) => {
          const rowNumber = index + 2;
          try {
            const rawName = this._getCsvValue(row, headerMap.nome);
            const rawPhone = this._getCsvValue(row, headerMap.telefone);

            if (!rawName && !rawPhone) {
              return;
            }

            const validation = this._validateRow(rawName, rawPhone);
            if (validation.isValid) {
              const variables = this._extractCsvVariables(row, headerMap, headerRow);
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

            processedRows += 1;
          } catch (rowError) {
            errors.push({
              row: rowNumber,
              error: `Unexpected Parsing Error: ${rowError.message}`
            });
          }
        });

        logger.info(`Parsing complete. Processed: ${processedRows}. Valid: ${validContacts.length}. Errors: ${errors.length}.`);
        return { contacts: validContacts, errors };
      }

      await workbook.xlsx.readFile(filePath);

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

      const normalizedMap = this._normalizeColumnMap(columnMap);
      this._validateHeaders(normalizedMap, headersFound);

      // Iterate Rows (Data starts at row 2)
      let processedRows = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        try {
          // Extract Data
          const rawName = this._getCellValue(row, normalizedMap.nome);
          const rawPhone = this._getCellValue(row, normalizedMap.telefone);

          if (!rawName && !rawPhone) {
             // Empty row, skip silently or log distinct debug
             return; 
          }

          // Validation
          const validation = this._validateRow(rawName, rawPhone);

          if (validation.isValid) {
            // Extract optional dynamic variables (all other columns)
            const variables = {};
            Object.keys(normalizedMap).forEach(header => {
              if (!this.requiredColumns.includes(header)) {
                variables[header] = this._getCellValue(row, normalizedMap[header]);
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

  _getCsvValue(row, colIndex) {
    if (!colIndex && colIndex !== 0) return '';
    const value = row[colIndex] ?? '';
    return String(value).trim();
  }

  _normalizeColumnMap(columnMap) {
    const normalized = {};
    Object.entries(columnMap).forEach(([header, colNumber]) => {
      const key = this._resolveHeader(header);
      if (key) {
        normalized[key] = colNumber;
      } else {
        normalized[header] = colNumber;
      }
    });
    return normalized;
  }

  _mapHeaders(headers) {
    const normalized = {};
    headers.forEach((header, index) => {
      const key = this._resolveHeader(header);
      if (key) {
        normalized[key] = index;
      } else if (header) {
        normalized[header] = index;
      }
    });
    return normalized;
  }

  _resolveHeader(header) {
    const normalizedHeader = String(header || '').trim().toLowerCase();
    if (!normalizedHeader) return null;
    const match = Object.entries(this.headerAliases).find(([, aliases]) =>
      aliases.includes(normalizedHeader)
    );
    return match ? match[0] : null;
  }

  _validateHeaders(columnMap, headersFound) {
    const missingColumns = this.requiredColumns.filter(col => !columnMap[col]);
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}. Found: ${headersFound.join(', ')}`);
    }
  }

  _extractCsvVariables(row, headerMap, headers) {
    const variables = {};
    Object.entries(headerMap).forEach(([key, index]) => {
      if (this.requiredColumns.includes(key)) return;
      const headerLabel = headers[index];
      variables[headerLabel] = this._getCsvValue(row, index);
    });
    return variables;
  }

  _validateRow(name, phone) {
    if (!name) {
      return { isValid: false, error: 'Missing Name' };
    }
    if (!phone) {
      return { isValid: false, error: 'Missing Phone' };
    }

    const cleanPhone = sanitizePhone(phone);
    if (!isValidPhone(cleanPhone)) {
      return { isValid: false, error: `Invalid Phone Format: ${cleanPhone}. Expected 55DDD9XXXXXXXX` };
    }

    return { isValid: true, cleanPhone };
  }
}

module.exports = ExcelParser;

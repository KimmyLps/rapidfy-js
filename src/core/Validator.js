// src/core/Validator.js (Pure JS Implementation)

const Validators = {
    /**
     * Checks if a value is present (not null, undefined, or empty string/array).
     * Rule: required
     */
    required: (value) => {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string' && value.trim() === '') return false;
        if (Array.isArray(value) && value.length === 0) return false;
        if (typeof value === 'object' && Object.keys(value).length === 0) return false;
        if (value instanceof File && value.size === 0) return false;
        if (value instanceof ArrayBuffer && value.byteLength === 0) return false;
        if (value instanceof DataView && value.byteLength === 0) return false;
        if (value instanceof Blob && value.size === 0) return false;
        if (typeof value === 'number' && isNaN(value)) return false;
        return true;
    },

    /**
     * Checks if a value is a valid email format.
     * Rule: email
     */
    email: (value) => {
        if (typeof value !== 'string') return false;
        // Basic regex check for email validity
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); 
    },

    /**
     * Checks if a value is a string.
     * Rule: string
     */
    string: (value) => {
        return typeof value === 'string';
    },

    /**
     * Checks if a value is a numeric.
     * Rule: numeric
     */
    numeric: (value) => {
        return typeof value === 'number' && !isNaN(value);
    },

    /**
     * Checks if string length is less than or equal to the defined size.
     * Rule: max:size
     */
    max: (value, size) => {
        if (typeof value !== 'string') return true; // Only validate if it's a string
        return value.length <= parseInt(size);
    },

    /**
     * Checks if string length is greater than or equal to the defined size.
     * Rule: min:size
     */
    min: (value, size) => {
        if (typeof value !== 'string') return true; 
        return value.length >= parseInt(size);
    },
    
    /**
     * Checks if a value is a string and matches the specified date format structure.
     * Rule: date_format:format (e.g., date_format:YYYY-MM-DD)
     * NOTE: This is a basic implementation using regex for structure check 
     * and Date object for general validity check, suitable for minimal dependencies.
     */
    date_format: (value, format) => {
        if (typeof value !== 'string') return false;
        if (!format) return false; // Must provide a format string

        let regexPattern;

        // 1. Create a Regular Expression based on the defined format structure.
        try {
             // 1.1. Escape delimiters in the format (e.g., '-' to '\-').
             const escapedFormat = format.replace(/([\/.-])/g, '\\$1');
             
             // 1.2. Convert date components to digit patterns (e.g., YYYY -> \d{4}).
             let pattern = escapedFormat
                .replace('YYYY', '\\d{4}') 
                .replace('YY', '\\d{2}')   
                .replace('MM', '\\d{2}')   
                .replace('DD', '\\d{2}')   
                .replace('HH', '\\d{2}')   
                .replace('mm', '\\d{2}')   
                .replace('ss', '\\d{2}');  
                
             // 1.3. Final regex for strict matching of the whole string.
             regexPattern = new RegExp(`^${pattern}$`);

        } catch (e) {
            console.error(`[RapidfyJS Validation Error] Invalid date format pattern: ${format}`, e);
            return false;
        }


        // 2. Check the string structure using Regex.
        if (!regexPattern.test(value)) {
            return false;
        }

        // 3. Check general date validity (prevents dates like 2023-99-99).
        // This relies on the JavaScript built-in Date parsing logic.
        const date = new Date(value);
        
        // Check if the date is invalid (NaN)
        return !isNaN(date.getTime());
    },
};

// ----------------------------------------------------

/**
 * Helper function to format field names for display (e.g., 'shipping_detail' -> 'Shipping Detail').
 * @param {string} fieldName - The raw field name (e.g., 'firstName', 'shipping_detail').
 * @returns {string} The formatted field name.
 */
function formatFieldName(fieldName) {
    if (typeof fieldName !== 'string' || fieldName.length === 0) {
        return '';
    }

    // 1. Convert snake_case (shipping_detail) or kebab-case to spaces.
    let formatted = fieldName.replace(/[-_]/g, ' ');

    // 2. Handle camelCase (firstName, shippingDetail) by inserting space before new capitals.
    formatted = formatted.replace(/([A-Z])/g, ' $1');
    
    // 3. Trim whitespace and ensure only one space separates words.
    formatted = formatted.trim().replace(/\s+/g, ' ');

    // 4. Capitalize the first letter of the resulting string.
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

// ----------------------------------------------------

/**
 * Executes string-based validation against the given request sources.
 */
function validateRequest(req, sources, rules) {
    let dataToValidate = {};
    const errors = {};

    // 1. Collect Data from Specified Sources
    for (const source of sources) {
        if (req[source]) {
            // Merge all data sources
            dataToValidate = { ...dataToValidate, ...req[source] };
        }
    }

    // 2. Execute Validation
    for (const field in rules) {
        const ruleString = rules[field]; 
        const ruleParts = ruleString.split('|');
        const value = dataToValidate[field];
        
        for (const rulePart of ruleParts) {
            let [ruleName, ruleParam] = rulePart.split(':');
            
            // Skip checks if the value is optional and not present, unless the rule is 'required'.
            if (!Validators.required(value) && ruleName !== 'required') {
                continue;
            }

            // Execute the Validator function
            if (Validators[ruleName]) {
                const isValid = Validators[ruleName](value, ruleParam);
                
                if (!isValid) {
                    // Validation Failed: Store the Error
                    if (!errors[field]) {
                        errors[field] = [];
                    }
                    
                    // Use the formatted field name for user-friendly display
                    const readableFieldName = formatFieldName(field);
                    errors[field].push(`The ${readableFieldName} field failed the ${ruleName} validation.`);
                    
                    break; // Stop checking this field after the first failure
                }
            } else {
                // Warn if an unknown rule is encountered
                console.warn(`[RapidfyJS Validation] Unknown rule: ${ruleName}`);
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        // Validation Failed
        return { 
            error: true, 
            errors: errors, 
            message: "Validation failed for one or more request sources."
        };
    }

    // Success: Return clean data (only fields defined in rules)
    const validated = {};
    for (const field in rules) {
        validated[field] = dataToValidate[field];
    }

    return { 
        error: false, 
        validated: validated 
    };
}

module.exports = validateRequest;
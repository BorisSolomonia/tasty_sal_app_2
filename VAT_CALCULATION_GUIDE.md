# VAT Calculation Feature Guide

## Overview

The RS.ge API Management page now includes automatic VAT calculations that display at the top of the page when waybill data is loaded.

## Updated Button Labels

- **ზედ-გაყიდვები** (Previously: ზედდებულების მიღება) - Get sales waybills
- **ზედ-შესყიდვები** (Previously: მყიდველის ზედდებულები) - Get purchase waybills

## VAT Calculation Logic

### Formula
For both sold and purchased waybills:
```
VAT Amount = (FULL_AMOUNT / 1.18) * 0.18
```

### Process
1. **Filter Confirmed Waybills**: Only waybills with STATUS = "1" or "CONFIRMED" are included
2. **Sum Total Amounts**: All FULL_AMOUNT values from confirmed waybills
3. **Calculate VAT**: Apply the formula above
4. **Net VAT**: Sold VAT - Purchased VAT

### Example Calculation
```
Sold Waybills FULL_AMOUNT Total: ₾11,800
Sold VAT = (11,800 / 1.18) * 0.18 = ₾1,800

Purchased Waybills FULL_AMOUNT Total: ₾5,900  
Purchased VAT = (5,900 / 1.18) * 0.18 = ₾900

Net VAT = ₾1,800 - ₾900 = ₾900 (Amount to pay)
```

## VAT Display Features

### Three Main Metrics
1. **გაყიდვული დღგ** (Sold VAT) - Green card
2. **შესყიდული დღგ** (Purchased VAT) - Blue card  
3. **წმინდა დღგ** (Net VAT) - Green (to pay) or Red (refund)

### Additional Information
- **Period Display**: Shows the selected date range
- **Waybill Count**: Number of confirmed waybills used in calculation
- **Status Indicator**: "გადასახდელი" (to pay) or "ბრუნდება" (refund)

## Usage Instructions

1. **Set Date Range**: Enter start and end dates
2. **Load Sales Data**: Click "ზედ-გაყიდვები" button
3. **Load Purchase Data**: Click "ზედ-შესყიდვები" button
4. **View VAT Summary**: The calculation appears automatically at the top

## Data Requirements

### Required Fields
- **STATUS**: Must be "1" or "CONFIRMED" for inclusion
- **FULL_AMOUNT**: The total amount including VAT

### Supported Field Variations
The system handles multiple field name formats:
- STATUS, status, Status
- FULL_AMOUNT, full_amount, FullAmount, TotalAmount, total_amount

## Visual Indicators

### Colors
- **Green**: Sold VAT amounts and positive net VAT
- **Blue**: Purchased VAT amounts
- **Emerald**: Positive net VAT (amount to pay)
- **Red**: Negative net VAT (refund due)

### Information Display
- Currency symbol: ₾ (Georgian Lari)
- Precision: 2 decimal places
- Count: Number of waybills included

## Error Handling

The VAT calculation includes:
- Null/undefined value protection
- Multiple data structure support
- Status validation
- Amount field validation

## Notes

- Only confirmed waybills (STATUS = 1) are included in calculations
- VAT rate is fixed at 18% (Georgian standard rate)
- Calculations are performed in real-time when data is loaded
- Data is automatically cleared when "Clear Results" is pressed
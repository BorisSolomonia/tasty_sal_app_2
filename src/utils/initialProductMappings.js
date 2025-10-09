/**
 * Initial Product Mappings Data
 *
 * This file contains the initial product mappings provided by the user.
 * To import these mappings into Firebase:
 * 1. Go to Product Mapping Management page
 * 2. Click "Import from Excel"
 * 3. Or use the bulkImportMappings function from productMappingService
 */

export const initialMappings = [
  // საქონელი (Beef/Cattle products)
  { sourceProduct: 'არტალა (რბილი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'მსხვილფეხა რქოსანის გაციებული ხორცი (იმპორტული)', targetProduct: 'საქონელი' },
  { sourceProduct: 'მსხვილფეხა რქოსანის ხორცი (ახალი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'მსხვილფეხა რქოსაფი პირუტყვის გაცივებული ცხიმი', targetProduct: 'საქონელი' },
  { sourceProduct: 'სამი სული დაკლული მსხვილფეხა საქონელი', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლი ხორცი გაყინული', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის გაყინული ხორცი (დაფასოებული ) მინერვა', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ენა', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ფარში', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ღვიძლი', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ცხიმი', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი (ბაგური ბუღა)', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი (ბარკლის რბილი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი (რბილი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი (სუკი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი (ძვლიანი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი 18%', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი ბონმარტი', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი გაციებული 1 კატ.', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი გაციებული 2 კატეგორია', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი გაციებული MT', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ხორცი სანგრია(მონდელი)', targetProduct: 'საქონელი' },
  { sourceProduct: 'საქონლის ჯიგარი', targetProduct: 'საქონელი' },
  { sourceProduct: 'ხორცი', targetProduct: 'საქონელი' },

  // ღორი (Pork products)
  { sourceProduct: 'გაყინული ღორის ზურგის ქონი', targetProduct: 'ღორი' },
  { sourceProduct: 'გაყინული ღორის უძვლო კისერი 18კგ ავიპალი', targetProduct: 'ღორი' },
  { sourceProduct: 'დაკლული ღორი 18 ც', targetProduct: 'ღორი' },
  { sourceProduct: 'დაკლული ღორი 25 ც', targetProduct: 'ღორი' },
  { sourceProduct: 'დაკლული ღორი 33 ც', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის კანჭი', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ნაწლავი', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის სალა', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ტანხორცი', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ფარში', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ქონი', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (ახალი)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (კისერი)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (პერედინა)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (რბილი)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (ტყავით)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (ფერდი)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (ჩალაღაჯი)', targetProduct: 'ღორი' },
  { sourceProduct: 'ღორის ხორცი (ძვლიანი)', targetProduct: 'ღორი' },

  // ბადექონი (Bacon)
  { sourceProduct: 'ბადექონი', targetProduct: 'ბადექონი' },

  // ცხვარი (Sheep/Lamb)
  { sourceProduct: 'ცხვრის დუმა', targetProduct: 'ცხვარი' },

  // ხბო (Veal)
  { sourceProduct: 'ხბოს ხორცი', targetProduct: 'ხბო' },
  { sourceProduct: 'ხბოს ხორცი (რბილი)', targetProduct: 'ხბო' },

  // ფრი (French fries)
  { sourceProduct: 'გაყინული კარტოფილი ფრი 9/9/ტრიუმფი/2,5კგ', targetProduct: 'ფრი' },
];

/**
 * Create an Excel file with these mappings
 * Can be imported via the ProductMappingPage UI
 */
export const createExcelTemplate = () => {
  return initialMappings.map(m => ({
    'საწყისი პროდუქტი': m.sourceProduct,
    'დაჯგუფებული პროდუქტი': m.targetProduct,
  }));
};

export const getTomorrow = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

export const getToday = () => new Date();

export const parseExcelDate = (value) => {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    const date = new Date((value - (25567 + 2)) * 86400 * 1000);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }
  if (typeof value === 'string') {
    const parts = value.split(/[/-]/);
    if (parts.length === 3) {
      const [month, day, year] = parts;
      const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date;
    }
    if (!value.trim()) {
      return null;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }
  return new Date(value);
};

export const normalizeName = (name) => {
  if (typeof name !== 'string') {
    if (name == null) return '';
    name = String(name);
  }
  return name.trim().toLowerCase();
};

export const t = {
  // General
  appName: "გაყიდვების მართვა",
  save: "შენახვა",
  actions: "მოქმედებები",
  edit: "რედაქტირება",
  remove: "წაშლა",
  back: "უკან",
  // Login
  loginTitle: "ავტორიზაცია",
  email: "ელ. ფოსტა",
  password: "პაროლი",
  login: "შესვლა",
  // Dashboard
  welcome: "მოგესალმებით",
  selectOption: "გთხოვთ, აირჩიოთ ოპერაცია მენიუდან.",
  role: "როლი",
  logout: "გასვლა",
  // Admin
  userManagement: "მომხმარებლების მართვა",
  registerNewUser: "ახალი მომხმარებლის რეგისტრაცია",
  fullName: "სრული სახელი",
  registerUser: "მომხმარებლის რეგისტრაცია",
  existingUsers: "არსებული მომხმარებლები",
  seller: "გამყიდველი",
  purchaseManager: "შესყიდვების მენეჯერი",
  addProduct: "პროდუქტის დამატება",
  addNewProduct: "ახალი პროდუქტის დამატება",
  productSKU: "პროდუქტის SKU",
  productName: "პროდუქტის დასახელება",
  productExistsError: "პროდუქტი ამ SKU-თი უკვე არსებობს.",
  manageProducts: "პროდუქტების მართვა",
  manageCustomers: "კლიენტების მართვა",
  delete: "წაშლა",
  confirmDeleteTitle: "წაშლის დადასტურება",
  confirmDeleteMsg: "დარწმუნებული ხართ, რომ გსურთ ამ ჩანაწერის წაშლა? ამ მოქმედების გაუქმება შეუძლებელია.",
  cancel: "გაუქმება",
  // Customer
  addCustomer: "კლიენტის დამატება",
  addNewCustomer: "ახალი კლიენტის დამატება",
  companyName: "კომპანიის სახელი",
  identificationNumber: "საიდენტიფიკაციო ნომერი",
  contactInfo: "საკონტაქტო ინფორმაცია (არასავალდებულო)",
  customerExistsError: "მომხმარებელი ამ საიდენტიფიკაციო ნომრით უკვე არსებობს.",
  // Order
  addOrder: "შეკვეთის დამატება",
  orderSummary: "შეკვეთების სია",
  addNewOrder: "ახალი შეკვეთის დამატება",
  orderDate: "შეკვეთის თარიღი",
  selectCustomer: "მოძებნეთ კლიენტი...",
  loadLastOrder: "ბოლო შეკვეთის ჩატვირთვა",
  selectProduct: "აირჩიეთ პროდუქტი",
  quantityKg: "რაოდენობა (კგ)",
  unitPrice: "ერთეულის ფასი",
  totalPrice: "სრული ფასი",
  commentOptional: "კომენტარი (არასავალდებულო)",
  addToList: "სიაში დამატება",
  pendingOrdersList: "მომლოდინე შეკვეთების სია",
  product: "პროდუქტი",
  qty: "რაოდ.",
  total: "ჯამი",
  type: "ტიპი",
  saveAllOrders: "ყველა შეკვეთის შენახვა",
  orderSaved: "შეკვეთა შენახულია",
  filterByDate: "გაფილტვრა თარიღით",
  exportToExcel: "Excel ექსპორტი",
  orderId: "ID",
  customer: "კლიენტი",
  status: "სტატუსი",
  enteredBy: "დაამატა",
  modifiedBy: "შეცვალა",
  comment: "კომენტარი",
  noOrdersFound: "ამ თარიღზე შეკვეთები არ მოიძებნა.",
  editOrder: "შეკვეთის რედაქტირება",
  saveChanges: "ცვლილებების შენახვა",
  cancelOrder: "შეკვეთის გაუქმება",
  blackOrder: "შავი შეკვეთა",
  repeatOrder: "გამეორება",
  // Purchase Manager
  ordersForPurchase: "შესასყიდი შეკვეთები",
  processOrders: "შეკვეთების დამუშავება",
  date: "თარიღი",
  pendingOrders: "მომლოდინე შეკვეთები",
  purchasePrice: "შესყიდვის ფასი",
  salesPrice: "გაყიდვის ფასი",
  aggregatedProducts: "დაჯგუფებული პროდუქტები",
  totalQty: "სრული რაოდ.",
  doneProceedToAssignment: "დასრულება - მომწოდებლის მიბმა",
  confirmPriceUpdate: "ფასის განახლების დადასტურება",
  applyToAllSimilar: "გავრცელდეს ამ თარიღის ყველა მსგავს პროდუქტზე?",
  yesUpdateAll: "კი, ყველას განახლება",
  noThisOrderOnly: "არა, მხოლოდ ამ შეკვეთის",
  saveAllEdits: "ყველა ცვლილების შენახვა",
  supplierAssignment: "მომწოდებლის მიბმა",
  assignSuppliers: "მომწოდებლების მიბმა",
  supplierName: "მომწოდებლის სახელი",
  notesPayableSummary: "გადასახდელების ამონაწერი",
  totalAmountOwed: "სულ გადასახდელი",
  assignToSeeSummary: "მიაბით მომწოდებელი ამონაწერის სანახავად.",
  saveSupplierAssignments: "მომწოდებლების შენახვა",
  accountsPayable: "ანგარიშსწორება მომწოდებლებთან",
  supplier: "მომწოდებელი",
  totalPurchased: "სულ შესყიდული",
  totalPaid: "სულ გადახდილი",
  balanceOwed: "დავალიანება",
  recordPayment: "გადახდის დაფიქსირება",
  paymentAmount: "გადახდის თანხა",
  submitPayment: "გადახდის შენახვა",
  purchaseSaved: "შესყიდვა შენახულია",
  changesSaved: "ცვლილებები შენახულია",
  aggregatedOrders: "დაჯგუფებული შეკვეთები",
  // Delivery Check
  deliveryCheck: "მიწოდებების შემოწმება",
  uploadExcel: "Excel ფაილის ატვირთვა",
  ordersTotal: "შეკვეთების ჯამი",
  deliveriesTotal: "მიწოდებების ჯამი",
  difference: "განსხვავება",
  noDataFound: "მონაცემები ვერ მოიძებნა",
  // RS.ge API Management
  rsApiManagement: "RS.ge API მართვა",
};

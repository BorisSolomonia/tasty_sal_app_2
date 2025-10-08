import React, { useState, createContext, useContext, useEffect, useMemo } from 'react';
import { getTomorrow, getToday, parseExcelDate, normalizeName, t } from './utils';
import RSApiManagementPage from './RSApiManagementPage';
import CustomerAnalysisPage from './CustomerAnalysisPage';
import InventoryManagementPage from './InventoryManagementPage';

// ============================================================================
// 1. FIREBASE & TRANSLATION SETUP
// ============================================================================
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    
    signOut, 
    onAuthStateChanged 
} from "firebase/auth";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    getDoc,
    getDocs,
    setDoc, 
    updateDoc, 
    deleteDoc,
    onSnapshot,
    query,
    where,
    Timestamp
} from "firebase/firestore";

// Font sizes available for the accessibility controls
const FONT_SIZES = ['text-sm', 'text-base', 'text-lg', 'text-xl'];

// Firebase configuration from environment variables with fallback
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyB15dF8g5C_2D55gOwSx7Txu0dUTKrqAQE",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "tastyapp-ff8b2.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "tastyapp-ff8b2",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "tastyapp-ff8b2.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "282950310544",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:282950310544:web:c2c00922dac72983d71615",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Validate Firebase configuration
const missingFirebaseVars = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== 'measurementId' && !value)
  .map(([key]) => key);

if (missingFirebaseVars.length > 0) {
  console.error('Missing required Firebase configuration:', missingFirebaseVars);
  console.error('Please check your .env file and ensure all REACT_APP_FIREBASE_* variables are set');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// ============================================================================
// 2. CONTEXT PROVIDERS (Authentication & Data Logic)
// ============================================================================
export const AuthContext = createContext();

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userDocRef = doc(db, "users", firebaseUser.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    setUser({ uid: firebaseUser.uid, ...userDoc.data() });
                } else { console.error("User document not found in Firestore."); setUser(null); }
            } else { setUser(null); }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
    const logout = () => signOut(auth);
    const registerUser = async (name, email, password, role) => {
        const tempApp = initializeApp(firebaseConfig, "Secondary" + Date.now());
        const tempAuth = getAuth(tempApp);
        const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), { name, email, role });
        await signOut(tempAuth);
    };
    const value = { user, loading, login, logout, registerUser };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);

const DataContext = createContext();

const DataProvider = ({ children }) => {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [orders, setOrders] = useState([]);
    const [payments, setPayments] = useState([]);
    const [manualCashPayments, setManualCashPayments] = useState([]);

    useEffect(() => {
        if (!user) {
            setUsers([]); setProducts([]); setCustomers([]); setOrders([]); setPayments([]); setManualCashPayments([]);
            return;
        }
        const unsubscribers = [
            onSnapshot(collection(db, "users"), snapshot => setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))),
            onSnapshot(collection(db, "products"), snapshot => setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))),
            onSnapshot(collection(db, "customers"), snapshot => setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))),
            onSnapshot(query(collection(db, "orders")), snapshot => setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), OrderDate: doc.data().OrderDate?.toDate(), EditedTimestamp: doc.data().EditedTimestamp?.toDate() })))),
            onSnapshot(collection(db, "payments"), snapshot => setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), paymentDate: doc.data().paymentDate?.toDate() })))),
            onSnapshot(collection(db, "manualCashPayments"), snapshot => setManualCashPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), paymentDate: doc.data().paymentDate?.toDate() })))),
        ];
        return () => unsubscribers.forEach(unsub => unsub());
    }, [user]);

    const deleteDocument = (collectionName, docId) => deleteDoc(doc(db, collectionName, docId));
    const addDocToCollection = (collectionName, data) => addDoc(collection(db, collectionName), data);
    const addProduct = async (product) => {
        const q = query(collection(db, "products"), where("ProductSKU", "==", product.ProductSKU));
        if (!(await getDocs(q)).empty) { alert(t.productExistsError); return false; }
        await addDocToCollection("products", product); return true;
    };
    const addCustomer = async (customer) => {
        const q = query(collection(db, "customers"), where("Identification", "==", customer.Identification));
        if (!(await getDocs(q)).empty) { alert(t.customerExistsError); return false; }
        await addDocToCollection("customers", customer); return true;
    };
    const addBulkOrders = (newOrders) => Promise.all(newOrders.map(order => addDocToCollection("orders", { ...order, OrderDate: Timestamp.fromDate(new Date(order.OrderDate)) })));
    const addOrder = (order) => addDocToCollection("orders", { ...order, OrderDate: Timestamp.fromDate(new Date(order.OrderDate)) });
    const updateOrder = (orderId, data) => updateDoc(doc(db, "orders", orderId), data);
    const updateMultipleOrderFields = (updates) => Promise.all(updates.map(({ orderId, fields }) => updateDoc(doc(db, "orders", orderId), fields)));
    const addPayment = (payment) => addDocToCollection("payments", { ...payment, paymentDate: Timestamp.fromDate(new Date(payment.paymentDate)) });
    const addManualCashPayment = (cashPayment) => addDocToCollection("manualCashPayments", { ...cashPayment, paymentDate: Timestamp.fromDate(new Date(cashPayment.paymentDate)) });
    const updateManualCashPayment = (paymentId, data) => updateDoc(doc(db, "manualCashPayments", paymentId), data);

    const value = { users, products, customers, orders, payments, manualCashPayments, deleteDocument, addProduct, addCustomer, addBulkOrders, addOrder, updateOrder, updateMultipleOrderFields, addPayment, addManualCashPayment, updateManualCashPayment };
    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
export const useData = () => useContext(DataContext);

// ============================================================================
// 3. REUSABLE UI COMPONENTS
// ============================================================================
const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl' };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className={`bg-white rounded-lg shadow-xl p-6 w-full ${sizeClasses[size]}`}>
        <div className="flex justify-between items-center border-b pb-3 mb-4"><h3 className="text-xl font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-2xl font-light text-gray-500 hover:text-gray-900">&times;</button></div>
        <div>{children}</div>
      </div>
    </div>
  );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
        <p className="mb-6">{message}</p>
        <div className="flex justify-end space-x-4">
            <button onClick={onClose} className="py-2 px-4 bg-gray-200 rounded-md hover:bg-gray-300">{t.cancel}</button>
            <button onClick={onConfirm} className="py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700">{t.delete}</button>
        </div>
    </Modal>
);

const Toast = ({ message, icon, show }) => {
    if (!show) return null;
    return (<div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center bg-green-500 text-white py-3 px-6 rounded-full shadow-lg transition-opacity duration-300">{icon}<span className="ml-3 font-semibold">{message}</span></div>);
};

// ============================================================================
// 4. PAGE COMPONENTS
// ============================================================================

// --- Admin: User Management ---
const UserManagementPage = () => {
    const { users } = useData(); const { registerUser } = useAuth(); const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'Seller' }); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.email || !formData.password) {
            setError('გთხოვთ, შეავსოთ ყველა ველი.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await registerUser(formData.name, formData.email, formData.password, formData.role);
            alert('მომხმარებელი წარმატებით დარეგისტრირდა!');
            setFormData({ name: '', email: '', password: '', role: 'Seller' });
        } catch (err) {
const msg = err.code === 'auth/email-already-in-use' ? 'ეს ელ. ფოსტა უკვე გამოყენებულია.' : err.message;
setError(msg);
alert(`რეგისტრაციის შეცდომა: ${msg}`);
        }
        setLoading(false);
    };
    return (<div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-md border"><h2 className="text-xl font-bold mb-4 text-gray-700">{t.registerNewUser}</h2><form onSubmit={handleSubmit} className="space-y-4"><input type="text" name="name" value={formData.name} onChange={handleChange} placeholder={t.fullName} className="w-full p-2 border rounded-md"/><input type="email" name="email" value={formData.email} onChange={handleChange} placeholder={t.email} className="w-full p-2 border rounded-md"/><input type="password" name="password" value={formData.password} onChange={handleChange} placeholder={t.password} className="w-full p-2 border rounded-md"/><select name="role" value={formData.role} onChange={handleChange} className="w-full p-2 border rounded-md bg-white"><option value="Seller">{t.seller}</option><option value="Purchase Manager">{t.purchaseManager}</option></select><button type="submit" disabled={loading} className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">{loading ? '...' : t.registerUser}</button>{error && <p className="text-red-500 text-sm mt-2">{error}</p>}</form></div>
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md border"><h2 className="text-xl font-bold mb-4 text-gray-700">{t.existingUsers}</h2><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.fullName}</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.email}</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t.role}</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{users.map(u => (<tr key={u.id}><td className="px-4 py-3 text-sm">{u.name}</td><td className="px-4 py-3 text-sm">{u.email}</td><td className="px-4 py-3 text-sm"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${u.role === 'Admin' ? 'bg-red-100 text-red-800' : u.role === 'Seller' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{u.role}</span></td></tr>))}</tbody></table></div></div></div>);
};

// --- Admin: Add Product ---
const AddProductPage = () => {
    const { addProduct } = useData(); const [formData, setFormData] = useState({ ProductSKU: '', ProductName: '', UnitPrice: '' });
    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleSubmit = async (e) => { e.preventDefault(); if (!formData.ProductSKU || !formData.ProductName || !formData.UnitPrice) { alert('გთხოვთ, შეავსოთ ყველა ველი.'); return; } const success = await addProduct({ ...formData, UnitPrice: parseFloat(formData.UnitPrice) }); if (success) { alert('პროდუქტი წარმატებით დაემატა!'); setFormData({ ProductSKU: '', ProductName: '', UnitPrice: '' }); } };
    return (<div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md border"><h2 className="text-2xl font-bold mb-6 text-center text-gray-700">{t.addNewProduct}</h2><form onSubmit={handleSubmit} className="space-y-6"><input type="text" name="ProductSKU" value={formData.ProductSKU} onChange={handleChange} placeholder={t.productSKU} required className="w-full p-2 border rounded-md"/><input type="text" name="ProductName" value={formData.ProductName} onChange={handleChange} placeholder={t.productName} required className="w-full p-2 border rounded-md"/><input type="number" step="0.01" name="UnitPrice" value={formData.UnitPrice} onChange={handleChange} placeholder={t.unitPrice} required className="w-full p-2 border rounded-md"/><button type="submit" className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">{t.addProduct}</button></form></div>);
};

// --- Admin: Manage Products ---
const ManageProductsPage = () => {
    const { products, deleteDocument } = useData(); const [confirmState, setConfirmState] = useState({ isOpen: false, id: null });
    const openConfirmModal = (id) => setConfirmState({ isOpen: true, id }); const closeConfirmModal = () => setConfirmState({ isOpen: false, id: null });
    const handleDelete = () => { if (confirmState.id) { deleteDocument("products", confirmState.id); closeConfirmModal(); } };
    const handleExport = () => { if(window.XLSX) { const worksheet = window.XLSX.utils.json_to_sheet(products); const workbook = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(workbook, worksheet, "Products"); window.XLSX.writeFile(workbook, "პროდუქტები.xlsx"); } };
    return (<div className="bg-white p-6 rounded-lg shadow-md border"><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{t.manageProducts}</h2><button onClick={handleExport} className="py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700">{t.exportToExcel}</button></div><div className="overflow-x-auto"><table className="min-w-full divide-y"><thead className="bg-gray-50"><tr><th className="p-2 text-left">{t.productSKU}</th><th className="p-2 text-left">{t.productName}</th><th className="p-2 text-left">{t.unitPrice}</th><th className="p-2 text-left">{t.actions}</th></tr></thead><tbody className="bg-white divide-y">{products.map(p => (<tr key={p.id}><td className="p-2">{p.ProductSKU}</td><td className="p-2">{p.ProductName}</td><td className="p-2">${p.UnitPrice.toFixed(2)}</td><td className="p-2"><button onClick={() => openConfirmModal(p.id)} className="text-red-600 hover:text-red-800">{t.delete}</button></td></tr>))}</tbody></table></div><ConfirmationModal isOpen={confirmState.isOpen} onClose={closeConfirmModal} onConfirm={handleDelete} title={t.confirmDeleteTitle} message={t.confirmDeleteMsg} /></div>);
};

// --- Admin: Manage Customers ---
const ManageCustomersPage = () => {
    const { customers, deleteDocument } = useData(); const [confirmState, setConfirmState] = useState({ isOpen: false, id: null });
    const openConfirmModal = (id) => setConfirmState({ isOpen: true, id }); const closeConfirmModal = () => setConfirmState({ isOpen: false, id: null });
    const handleDelete = () => { if (confirmState.id) { deleteDocument("customers", confirmState.id); closeConfirmModal(); } };
    const handleExport = () => { if(window.XLSX) { const worksheet = window.XLSX.utils.json_to_sheet(customers); const workbook = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(workbook, worksheet, "Customers"); window.XLSX.writeFile(workbook, "კლიენტები.xlsx"); } };
    return (<div className="bg-white p-6 rounded-lg shadow-md border"><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{t.manageCustomers}</h2><button onClick={handleExport} className="py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700">{t.exportToExcel}</button></div><div className="overflow-x-auto"><table className="min-w-full divide-y"><thead className="bg-gray-50"><tr><th className="p-2 text-left">{t.companyName}</th><th className="p-2 text-left">{t.identificationNumber}</th><th className="p-2 text-left">{t.contactInfo}</th><th className="p-2 text-left">{t.actions}</th></tr></thead><tbody className="bg-white divide-y">{customers.map(c => (<tr key={c.id}><td className="p-2">{c.CustomerName}</td><td className="p-2">{c.Identification}</td><td className="p-2">{c.ContactInfo}</td><td className="p-2"><button onClick={() => openConfirmModal(c.id)} className="text-red-600 hover:text-red-800">{t.delete}</button></td></tr>))}</tbody></table></div><ConfirmationModal isOpen={confirmState.isOpen} onClose={closeConfirmModal} onConfirm={handleDelete} title={t.confirmDeleteTitle} message={t.confirmDeleteMsg} /></div>);
};

// --- Shared: Add Customer ---
const AddCustomerPage = () => {
    const { addCustomer } = useData();
    const [formData, setFormData] = useState({ CustomerName: '', Identification: '', ContactInfo: '' });
    const handleSubmit = async (e) => { e.preventDefault(); if (!formData.CustomerName || !formData.Identification) { alert('კომპანიის სახელი და საიდენტიფიკაციო ნომერი სავალდებულოა.'); return; } const success = await addCustomer(formData); if (success) { alert('მომხმარებელი წარმატებით დაემატა!'); setFormData({ CustomerName: '', Identification: '', ContactInfo: '' }); } };
    return (<div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md border"><h2 className="text-2xl font-bold mb-6 text-center text-gray-700">{t.addNewCustomer}</h2><form onSubmit={handleSubmit} className="space-y-6"><input type="text" value={formData.CustomerName} onChange={(e) => setFormData({...formData, CustomerName: e.target.value})} placeholder={t.companyName} required className="w-full p-2 border rounded-md"/><input type="text" value={formData.Identification} onChange={(e) => setFormData({...formData, Identification: e.target.value})} placeholder={t.identificationNumber} required className="w-full p-2 border rounded-md"/><input type="text" value={formData.ContactInfo} onChange={(e) => setFormData({...formData, ContactInfo: e.target.value})} placeholder={t.contactInfo} className="w-full p-2 border rounded-md"/><button type="submit" className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">{t.addCustomer}</button></form></div>);
};

// --- Seller: Add Order ---
const AddOrderPage = ({ prefillOrder, onPrefillConsumed, onNavigateToSummary }) => {
    const { customers, products, orders, addBulkOrders } = useData(); const { user } = useAuth();
    const initialFormState = { OrderDate: getTomorrow().toISOString().split('T')[0], CustomerName: '', ProductSKU: '', ProductSearch: '', Quantity: '', UnitPrice: '', Comment: '', isBlack: false };
    const [formState, setFormState] = useState(initialFormState); const [tempOrderList, setTempOrderList] = useState([]); const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false); const [showProductSuggestions, setShowProductSuggestions] = useState(false);

    useEffect(() => {
        if (prefillOrder) {
            const productName = products.find(p => p.ProductSKU === prefillOrder.ProductSKU)?.ProductName || '';
            setFormState({
                OrderDate: getTomorrow().toISOString().split('T')[0],
                CustomerName: prefillOrder.CustomerName,
                ProductSKU: prefillOrder.ProductSKU,
                ProductSearch: productName,
                Quantity: prefillOrder.Quantity,
                UnitPrice: prefillOrder.UnitPrice,
                Comment: prefillOrder.Comment || '',
                isBlack: prefillOrder.isBlack || false
            });
            onPrefillConsumed && onPrefillConsumed();
        }
    }, [prefillOrder, products, onPrefillConsumed]);
    const selectedProduct = products.find(p => p.ProductSKU === formState.ProductSKU); const totalPrice = (parseFloat(formState.UnitPrice) || 0) * (parseFloat(formState.Quantity) || 0);
    const customerSuggestions = useMemo(() => { if (!formState.CustomerName) return []; return customers.filter(c => c.CustomerName.toLowerCase().includes(formState.CustomerName.toLowerCase())); }, [formState.CustomerName, customers]);
    const productSuggestions = useMemo(() => { if (!formState.ProductSearch) return []; return products.filter(p => p.ProductName.toLowerCase().includes(formState.ProductSearch.toLowerCase())); }, [formState.ProductSearch, products]);
    useEffect(() => { if (formState.ProductSKU) { const lastOrderForProduct = orders.filter(o => o.ProductSKU === formState.ProductSKU && o.salesPrice).sort((a, b) => b.OrderDate - a.OrderDate)[0]; const baseProductPrice = products.find(p => p.ProductSKU === formState.ProductSKU)?.UnitPrice || ''; setFormState(prev => ({ ...prev, UnitPrice: lastOrderForProduct ? lastOrderForProduct.salesPrice : baseProductPrice })); } else { setFormState(prev => ({ ...prev, UnitPrice: '' })); } }, [formState.ProductSKU, orders, products]);
    const handleChange = (e) => { const { name, value, type, checked } = e.target; setFormState(prev => ({...prev, [name]: type === 'checkbox' ? checked : value })); };
    const handleAddToList = () => { if (!formState.CustomerName || !formState.ProductSKU || !formState.Quantity || !formState.UnitPrice) { alert('გთხოვთ, შეავსოთ ყველა სავალდებულო ველი.'); return; } const newOrderItem = { id: `temp-${Date.now()}`, ...formState, ProductName: selectedProduct.ProductName, UnitPrice: parseFloat(formState.UnitPrice), TotalPrice: totalPrice }; setTempOrderList(prev => [...prev, newOrderItem]); setFormState(prev => ({...initialFormState, OrderDate: prev.OrderDate, CustomerName: prev.CustomerName})); };
    const handleRemoveFromList = (id) => setTempOrderList(prev => prev.filter(item => item.id !== id));
    const handleSaveAll = () => { const newOrders = tempOrderList.map(({id, ...item}) => ({ ...item, EnteredBy: user.email, OrderStatus: 'Pending', salesPrice: item.UnitPrice })); addBulkOrders(newOrders).then(() => { alert(`${newOrders.length} ${t.orderSaved}`); setTempOrderList([]); setFormState(prev => ({...initialFormState, OrderDate: prev.OrderDate, CustomerName: prev.CustomerName})); if (onNavigateToSummary) { setTimeout(() => onNavigateToSummary(formState.OrderDate), 100); } }); };
    const handleLoadLastOrder = () => { if (!formState.CustomerName) return; const lastOrder = orders.filter(o => o.CustomerName === formState.CustomerName).sort((a,b) => b.OrderDate - a.OrderDate)[0]; if (lastOrder) { const lastProd = products.find(p => p.ProductSKU === lastOrder.ProductSKU); setFormState(prev => ({ ...prev, ProductSKU: lastOrder.ProductSKU, ProductSearch: lastProd ? lastProd.ProductName : '', Quantity: lastOrder.Quantity, Comment: lastOrder.Comment, isBlack: lastOrder.isBlack })); } else { alert(t.noOrdersFound); } };
    const handleCustomerSelect = (customerName) => { setFormState(prev => ({...prev, CustomerName: customerName})); setShowCustomerSuggestions(false); }
    const handleProductSelect = (product) => { setFormState(prev => ({ ...prev, ProductSKU: product.ProductSKU, ProductSearch: product.ProductName })); setShowProductSuggestions(false); }
    return (<div className="space-y-6"><div className="bg-white p-6 rounded-lg shadow-md border"><h2 className="text-xl font-bold mb-4">{t.addNewOrder}</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        <div><label className="text-xs">{t.orderDate}</label><input type="date" name="OrderDate" value={formState.OrderDate} onChange={handleChange} className="w-full p-2 border rounded-md"/></div>
        <div className="relative"><label className="text-xs">{t.customer} {tempOrderList.length > 0 && <span className="text-blue-600">(დარჩება შემდეგისთვის)</span>}</label><div className="flex"><input type="text" name="CustomerName" value={formState.CustomerName} onChange={(e) => { handleChange(e); setShowCustomerSuggestions(true); }} placeholder={t.selectCustomer} className={`flex-1 p-2 border bg-white ${formState.CustomerName ? 'rounded-l-md' : 'rounded-md'}`} autoComplete="off"/>{formState.CustomerName && (<button type="button" onClick={() => setFormState(prev => ({ ...prev, CustomerName: '' }))} className="px-3 py-2 bg-gray-200 border-l-0 border rounded-r-md hover:bg-gray-300 text-gray-600">×</button>)}</div>{showCustomerSuggestions && customerSuggestions.length > 0 && (<ul className="absolute z-10 w-full bg-white border mt-1 max-h-48 overflow-y-auto rounded-md shadow-lg">{customerSuggestions.map(c => <li key={c.id} onClick={() => handleCustomerSelect(c.CustomerName)} className="p-2 hover:bg-blue-100 cursor-pointer">{c.CustomerName}</li>)}</ul>)}</div>
        <div><label className="text-xs">&nbsp;</label><button onClick={handleLoadLastOrder} disabled={!formState.CustomerName} className="w-full p-2 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50">{t.loadLastOrder}</button></div><div></div>
        <div className="relative"><label className="text-xs">{t.product}</label><input type="text" name="ProductSearch" value={formState.ProductSearch} onChange={(e) => { setFormState(prev => ({ ...prev, ProductSearch: e.target.value, ProductSKU: '', UnitPrice: '' })); setShowProductSuggestions(true); }} placeholder={t.selectProduct} className="w-full p-2 border rounded-md bg-white" autoComplete="off"/>{showProductSuggestions && productSuggestions.length > 0 && (<ul className="absolute z-10 w-full bg-white border mt-1 max-h-48 overflow-y-auto rounded-md shadow-lg">{productSuggestions.map(p => <li key={p.id} onClick={() => handleProductSelect(p)} className="p-2 hover:bg-blue-100 cursor-pointer">{p.ProductName}</li>)}</ul>)}</div>
        <div><label className="text-xs">{t.quantityKg}</label><input type="number" name="Quantity" value={formState.Quantity} onChange={handleChange} placeholder={t.quantityKg} className="w-full p-2 border rounded-md"/></div>
        <div><label className="text-xs">{t.unitPrice}</label><input type="number" step="0.01" name="UnitPrice" value={formState.UnitPrice} onChange={handleChange} placeholder={t.unitPrice} className="w-full p-2 border rounded-md"/></div>
        <div className="p-2 bg-gray-100 rounded-md text-center self-end h-[42px] flex items-center justify-center"><p className="text-sm">{t.total}: <span className="font-bold">${totalPrice.toFixed(2)}</span></p></div>
        <div className="md:col-span-2 lg:col-span-2"><label className="text-xs">{t.commentOptional}</label><textarea name="Comment" value={formState.Comment} onChange={handleChange} placeholder={t.commentOptional} className="w-full p-2 border rounded-md"/></div>
        <div className="flex items-end pb-2 space-x-2"><input type="checkbox" name="isBlack" id="isBlack" checked={formState.isBlack} onChange={handleChange} className="h-5 w-5 rounded border-gray-300"/><label htmlFor="isBlack" className="font-medium text-gray-700">{t.blackOrder}</label></div>
        <div className="self-end"><button onClick={handleAddToList} className="w-full py-2 px-6 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700">{t.addToList}</button></div>
    </div></div>
    {tempOrderList.length > 0 && (<div className="bg-white p-6 rounded-lg shadow-md border"><h3 className="text-lg font-bold mb-3">{t.pendingOrdersList}</h3><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50"><tr>{[t.product, t.qty, t.unitPrice, t.total, t.type, t.actions].map(h => <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody className="bg-white divide-y">{tempOrderList.map(item => (<tr key={item.id}><td className="px-4 py-2">{item.ProductName}</td><td className="px-4 py-2">{item.Quantity} kg</td><td className="px-4 py-2">${parseFloat(item.UnitPrice).toFixed(2)}</td><td className="px-4 py-2">${item.TotalPrice.toFixed(2)}</td><td className="px-4 py-2">{item.isBlack ? '⚫ შავი' : ''}</td><td className="px-4 py-2"><button onClick={() => handleRemoveFromList(item.id)} className="text-red-600 hover:text-red-800">{t.remove}</button></td></tr>))}</tbody>
    </table></div><div className="mt-4 text-right"><button onClick={handleSaveAll} className="py-2 px-8 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">{t.saveAllOrders}</button></div></div>)}
    </div>);
};

const OrderSummaryPage = ({ onRepeat, initialDate }) => {
    const { orders, updateOrder, deleteDocument } = useData(); const { user } = useAuth(); const [filterDate, setFilterDate] = useState(initialDate || getToday().toISOString().split('T')[0]); const [isModalOpen, setIsModalOpen] = useState(false); const [selectedOrder, setSelectedOrder] = useState(null); const [editForm, setEditForm] = useState({ Quantity: '', OrderStatus: '', Comment: '' });
    const [confirmState, setConfirmState] = useState({ isOpen: false, id: null });
    
    // Update filterDate when initialDate changes
    useEffect(() => {
        if (initialDate) {
            setFilterDate(initialDate);
        }
    }, [initialDate]);
    const isFullAccess = user.role === 'Admin';
    const ordersToDisplay = useMemo(() => isFullAccess ? orders : orders.filter(o => new Date(o.OrderDate).toISOString().split('T')[0] === filterDate), [orders, filterDate, isFullAccess]);
    const handleEditClick = (order) => { setSelectedOrder(order); setEditForm({ Quantity: order.Quantity, OrderStatus: order.OrderStatus, Comment: order.Comment || '' }); setIsModalOpen(true); };
    const handleModalClose = () => setIsModalOpen(false);
    const openConfirmModal = (id) => setConfirmState({ isOpen: true, id }); const closeConfirmModal = () => setConfirmState({ isOpen: false, id: null });
    const handleDelete = () => { if (confirmState.id) { deleteDocument("orders", confirmState.id); closeConfirmModal(); } };
    const handleSaveChanges = () => { if (!editForm.Quantity || parseFloat(editForm.Quantity) <= 0) { alert('მიუთითეთ ვალიდური რაოდენობა.'); return; } const updatedFields = { ...editForm, Quantity: parseFloat(editForm.Quantity), TotalPrice: selectedOrder.UnitPrice * parseFloat(editForm.Quantity), EditedBy: user.email, EditedTimestamp: Timestamp.now() }; updateOrder(selectedOrder.id, updatedFields); handleModalClose(); };
    const handleCancelOrder = () => { updateOrder(selectedOrder.id, { OrderStatus: 'Cancelled', EditedBy: user.email, EditedTimestamp: Timestamp.now() }); handleModalClose(); };
    const handleRepeatOrder = (order) => {
        onRepeat && onRepeat(order);
    };
    const handleExport = () => {
        if(window.XLSX) {
            const dataToExport = isFullAccess ? orders : ordersToDisplay;
            const filename = isFullAccess ? 'ყველა_შეკვეთა.xlsx' : `შეკვეთები-${filterDate}.xlsx`;
            const worksheet = window.XLSX.utils.json_to_sheet(dataToExport.map(o => ({
                'ID': o.id,
                'თარიღი': o.OrderDate.toLocaleDateString(),
                'კლიენტი': o.CustomerName,
                'პროდუქტი': o.ProductName,
                'რაოდენობა': o.Quantity,
                'სრული ფასი': ((o.TotalPrice ?? (o.Quantity * (o.salesPrice ?? o.UnitPrice ?? 0)))).toFixed(2),
                'სტატუსი': o.OrderStatus,
                'ტიპი': o.isBlack ? 'შავი' : '',
                'დაამატა': o.EnteredBy,
                'შეცვალა': o.EditedBy || '',
                'ცვლილების თარიღი': o.EditedTimestamp ? o.EditedTimestamp.toLocaleString() : '',
                'კომენტარი': o.Comment || ''
            })));
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
            window.XLSX.writeFile(workbook, filename);
        }
    };
    
    return (<div className="bg-white p-6 rounded-lg shadow-md border"><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{t.orderSummary}</h2><button onClick={handleExport} className="py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700">{t.exportToExcel}</button></div>
        {!isFullAccess && <div className="mb-4"><label className="mr-2">{t.filterByDate}:</label><input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="p-2 border rounded-md"/></div>}
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr>{[t.orderId, t.date, t.customer, t.product, t.qty, t.totalPrice, t.status, t.type, t.enteredBy, t.modifiedBy, t.comment, t.actions].map(h=><th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody className="bg-white divide-y">{ordersToDisplay.map(order => (
            <tr key={order.id}>
                <td className="px-3 py-2 whitespace-nowrap">{order.id.slice(-6)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(order.OrderDate).toLocaleDateString()}</td>
                <td className="px-3 py-2">{order.CustomerName}</td>
                <td className="px-3 py-2">{order.ProductName}</td>
                <td className="px-3 py-2">{order.Quantity}</td>
                <td className="px-3 py-2">${(order.TotalPrice || (order.Quantity * (order.salesPrice || order.UnitPrice || 0))).toFixed(2)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${order.OrderStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800' : order.OrderStatus === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{order.OrderStatus}</span></td>
                <td className="px-3 py-2">{order.isBlack && <span className="font-bold text-black">⚫</span>}</td>
                <td className="px-3 py-2">{order.EnteredBy}</td>
                <td className="px-3 py-2">{order.EditedBy ? `📝 ${order.EditedBy}` : ''}</td>
                <td className="px-3 py-2">{order.Comment}</td>
                <td className="px-3 py-2 flex space-x-2"><button onClick={() => handleRepeatOrder(order)} className="text-green-600">{t.repeatOrder}</button><button onClick={() => handleEditClick(order)} className="text-blue-600">{t.edit}</button>{user.role === 'Admin' && <button onClick={() => openConfirmModal(order.id)} className="text-red-600">{t.delete}</button>}</td>
            </tr>
        ))}</tbody>
        </table>{ordersToDisplay.length === 0 && <p className="text-center py-4">{t.noOrdersFound}</p>}</div>
        <ConfirmationModal isOpen={confirmState.isOpen} onClose={closeConfirmModal} onConfirm={handleDelete} title={t.confirmDeleteTitle} message={t.confirmDeleteMsg} />
        <Modal isOpen={isModalOpen} onClose={handleModalClose} title={`${t.editOrder} ${selectedOrder?.id.slice(-6)}`}><div className="space-y-4"><input type="number" value={editForm.Quantity} onChange={e => setEditForm({...editForm, Quantity: e.target.value})} placeholder={t.quantityKg} className="w-full p-2 border rounded-md"/><select value={editForm.OrderStatus} onChange={e => setEditForm({...editForm, OrderStatus: e.target.value})} className="w-full p-2 border bg-white rounded-md"><option>Pending</option><option>Completed</option><option>Cancelled</option></select><textarea value={editForm.Comment} onChange={e => setEditForm({...editForm, Comment: e.target.value})} placeholder={t.comment} className="w-full p-2 border rounded-md"/><div className="flex justify-end space-x-3"><button onClick={handleCancelOrder} className="py-2 px-4 bg-red-600 text-white rounded-md">{t.cancelOrder}</button><button onClick={handleSaveChanges} className="py-2 px-4 bg-blue-600 text-white rounded-md">{t.saveChanges}</button></div></div></Modal>
    </div>);
};

const OrdersForPurchasePage = ({ onDone }) => {
    const { orders, updateMultipleOrderFields } = useData(); const { user } = useAuth(); const [purchaseDate, setPurchaseDate] = useState(getTomorrow().toISOString().split('T')[0]); const [editableOrders, setEditableOrders] = useState([]); const [priceConfirmModal, setPriceConfirmModal] = useState({ isOpen: false }); const [showToast, setShowToast] = useState(false);
    useEffect(() => { const pending = orders.filter(o => new Date(o.OrderDate).toISOString().split('T')[0] === purchaseDate && o.OrderStatus === 'Pending'); setEditableOrders(pending.map(o => ({ ...o, isDirty: false, originalPurchasePrice: o.purchasePrice, originalSalesPrice: o.salesPrice }))); }, [purchaseDate, orders]);
    const handleInputChange = (id, field, value) => { setEditableOrders(prev => prev.map(o => o.id === id ? {...o, [field]: value, isDirty: true } : o)); };
    const handleSaveRow = (order) => { const priceChanged = order.purchasePrice !== order.originalPurchasePrice || order.salesPrice !== order.originalSalesPrice; if (priceChanged && (order.purchasePrice || order.salesPrice)) { setPriceConfirmModal({ isOpen: true, productSku: order.ProductSKU, purchasePrice: order.purchasePrice, salesPrice: order.salesPrice, orderId: order.id }); } else { updateMultipleOrderFields([{ orderId: order.id, fields: { Quantity: parseFloat(order.Quantity), EditedBy: user.email, EditedTimestamp: Timestamp.now() } }]); setEditableOrders(prev => prev.map(o => o.id === order.id ? { ...o, isDirty: false } : o)); setShowToast(true); setTimeout(() => setShowToast(false), 3000); }};
    const handlePriceConfirm = (applyToAll) => { const { productSku, purchasePrice, salesPrice, orderId } = priceConfirmModal; const updates = []; const fieldsToUpdate = { purchasePrice: parseFloat(purchasePrice) || null, salesPrice: parseFloat(salesPrice) || null, EditedBy: user.email, EditedTimestamp: Timestamp.now() }; if (applyToAll) { editableOrders.forEach(o => { if (o.ProductSKU === productSku) updates.push({ orderId: o.id, fields: fieldsToUpdate }) }); } else { updates.push({ orderId, fields: fieldsToUpdate }); } updateMultipleOrderFields(updates); setPriceConfirmModal({ isOpen: false }); setShowToast(true); setTimeout(() => setShowToast(false), 3000); };
    const handleSaveAllChanges = () => { const dirtyOrders = editableOrders.filter(o => o.isDirty); if (dirtyOrders.length === 0) return; const updates = dirtyOrders.map(order => ({ orderId: order.id, fields: { Quantity: parseFloat(order.Quantity), purchasePrice: order.purchasePrice ? parseFloat(order.purchasePrice) : null, salesPrice: order.salesPrice ? parseFloat(order.salesPrice) : null, EditedBy: user.email, EditedTimestamp: Timestamp.now() } })); updateMultipleOrderFields(updates); setShowToast(true); setTimeout(() => setShowToast(false), 3000); };
    const aggregatedProducts = useMemo(() => { const groups = {}; editableOrders.forEach(o => { const qty = parseFloat(o.Quantity || 0); if (o.purchasePrice > 0 && qty > 0) { const key = `${o.ProductSKU}-${o.purchasePrice}`; if (!groups[key]) groups[key] = { ProductSKU: o.ProductSKU, ProductName: o.ProductName, purchasePrice: o.purchasePrice, totalQuantity: 0 }; groups[key].totalQuantity += qty; } }); return Object.values(groups); }, [editableOrders]);
    return (<div className="space-y-6"><Toast message={t.changesSaved} show={showToast} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>} /><div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"><h2 className="text-xl font-bold">{t.processOrders}</h2><div><label className="mr-2">{t.date}:</label><input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="p-2 border rounded-md"/></div></div><div className="grid grid-cols-1 lg:grid-cols-5 gap-6"><div className="lg:col-span-3 bg-white p-4 rounded-lg shadow-md border"><div className="flex justify-between items-center mb-3"><h3 className="font-bold">{t.pendingOrders}</h3><button onClick={handleSaveAllChanges} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700">{t.saveAllEdits}</button></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-100 sticky top-0"><tr>{[t.customer, t.qty, t.purchasePrice, t.salesPrice, t.actions].map(h => <th key={h} className="p-2 text-left text-xs font-medium text-gray-600 uppercase">{h}</th>)}</tr></thead><tbody>{editableOrders.map(order => (<tr key={order.id} className="border-b"><td className="p-2"><p className="font-semibold">{order.CustomerName}</p><p className="text-xs text-gray-600">{order.ProductName} {order.isBlack && '⚫'}</p></td><td className="p-2"><input type="number" value={order.Quantity} onChange={e => handleInputChange(order.id, 'Quantity', e.target.value)} className="w-20 p-1 border rounded"/></td><td className="p-2"><input type="number" step="0.01" value={order.purchasePrice || ''} onChange={e => handleInputChange(order.id, 'purchasePrice', e.target.value)} className="w-24 p-1 border rounded"/></td><td className="p-2"><input type="number" step="0.01" value={order.salesPrice || ''} onChange={e => handleInputChange(order.id, 'salesPrice', e.target.value)} className="w-24 p-1 border rounded"/></td><td className="p-2">{order.isDirty && <button onClick={() => handleSaveRow(order)} className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">{t.save}</button>}</td></tr>))}{editableOrders.length === 0 && <tr><td colSpan="5" className="text-center p-4 text-gray-500">{t.noOrdersFound}</td></tr>}</tbody></table></div></div><div className="lg:col-span-2 bg-white p-4 rounded-lg shadow-md border"><h3 className="font-bold mb-3">{t.aggregatedProducts}</h3><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-100 sticky top-0"><tr>{[t.product, t.totalQty, t.purchasePrice].map(h => <th key={h} className="p-2 text-left text-xs font-medium text-gray-600 uppercase">{h}</th>)}</tr></thead><tbody>{aggregatedProducts.map(agg => (<tr key={`${agg.ProductSKU}-${agg.purchasePrice}`} className="border-b"><td className="p-2 font-semibold">{agg.ProductName}</td><td className="p-2">{agg.totalQuantity.toFixed(2)} kg</td><td className="p-2">${parseFloat(agg.purchasePrice).toFixed(2)}</td></tr>))}{aggregatedProducts.length === 0 && <tr><td colSpan="3" className="text-center p-4 text-gray-500">{t.assignToSeeSummary}</td></tr>}</tbody></table></div></div></div><div className="text-center mt-6"><button onClick={() => onDone(editableOrders.filter(o => o.purchasePrice > 0), purchaseDate)} className="py-3 px-10 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-400" disabled={aggregatedProducts.length === 0}>{t.doneProceedToAssignment}</button></div>
            <Modal isOpen={priceConfirmModal.isOpen} onClose={() => setPriceConfirmModal({isOpen: false})} title={t.confirmPriceUpdate}><p className="mb-6">{t.applyToAllSimilar}</p><div className="flex justify-around"><button onClick={() => handlePriceConfirm(true)} className="py-2 px-6 bg-blue-600 text-white rounded-md hover:bg-blue-700">{t.yesUpdateAll}</button><button onClick={() => handlePriceConfirm(false)} className="py-2 px-6 bg-gray-600 text-white rounded-md hover:bg-gray-700">{t.noThisOrderOnly}</button></div></Modal></div>);
};

const AggregatedOrdersPage = () => {
    const { orders } = useData();
    const [aggDate, setAggDate] = useState(getToday().toISOString().split('T')[0]);

    const aggregates = useMemo(() => {
        const groups = {};
        orders.filter(o => new Date(o.OrderDate).toISOString().split('T')[0] === aggDate)
            .forEach(o => {
                const price = o.salesPrice || o.UnitPrice || 0;
                const key = `${o.ProductSKU}-${price}`;
                if (!groups[key]) groups[key] = { sku: o.ProductSKU, name: o.ProductName, price, qty: 0 };
                groups[key].qty += parseFloat(o.Quantity || 0);
            });
        return Object.values(groups);
    }, [orders, aggDate]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border space-y-4">
            <div>
                <label className="mr-2">{t.date}:</label>
                <input type="date" value={aggDate} onChange={e => setAggDate(e.target.value)} className="p-2 border rounded-md" />
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left">{t.product}</th>
                            <th className="px-3 py-2 text-left">{t.totalQty}</th>
                            <th className="px-3 py-2 text-left">{t.unitPrice}</th>
                            <th className="px-3 py-2 text-left">{t.totalPrice}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y">
                        {aggregates.map(a => (
                            <tr key={`${a.sku}-${a.price}`} className="border-b">
                                <td className="px-3 py-2 font-semibold">{a.name}</td>
                                <td className="px-3 py-2">{a.qty.toFixed(2)} kg</td>
                                <td className="px-3 py-2">${parseFloat(a.price).toFixed(2)}</td>
                                <td className="px-3 py-2">${(a.qty * a.price).toFixed(2)}</td>
                            </tr>
                        ))}
                        {aggregates.length === 0 && (
                            <tr>
                                <td colSpan="4" className="text-center p-4 text-gray-500">{t.noOrdersFound}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const SupplierAssignmentPage = ({ processedOrders, forDate, onBack }) => {
    const { orders, updateMultipleOrderFields } = useData(); const [assignments, setAssignments] = useState({}); const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const aggregatedProducts = useMemo(() => { if (!processedOrders) return []; const groups = {}; processedOrders.forEach(o => { if (o.purchasePrice > 0) { const key = `${o.ProductSKU}-${o.purchasePrice}`; if (!groups[key]) groups[key] = { ProductSKU: o.ProductSKU, ProductName: o.ProductName, purchasePrice: o.purchasePrice, totalQuantity: 0, orderIds: [] }; groups[key].totalQuantity += parseFloat(o.Quantity || 0); groups[key].orderIds.push(o.id); } }); return Object.values(groups); }, [processedOrders]);
    useEffect(() => { const initialAssignments = {}; aggregatedProducts.forEach(product => { const lastOrderWithSupplier = orders.filter(o => o.ProductSKU === product.ProductSKU && o.supplierName).sort((a,b) => b.OrderDate - a.OrderDate)[0]; if (lastOrderWithSupplier) initialAssignments[`${product.ProductSKU}-${product.purchasePrice}`] = lastOrderWithSupplier.supplierName; }); setAssignments(initialAssignments); }, [aggregatedProducts, orders]);
    const handleSupplierChange = (key, supplierName) => setAssignments(prev => ({ ...prev, [key]: supplierName }));
    const notesPayable = useMemo(() => { const supplierTotals = {}; aggregatedProducts.forEach(product => { const key = `${product.ProductSKU}-${product.purchasePrice}`; const supplier = assignments[key]; if (supplier) { if (!supplierTotals[supplier]) supplierTotals[supplier] = 0; supplierTotals[supplier] += product.totalQuantity * product.purchasePrice; } }); return Object.entries(supplierTotals); }, [assignments, aggregatedProducts]);
    const handleSaveAssignments = () => { const updates = []; aggregatedProducts.forEach(product => { const key = `${product.ProductSKU}-${product.purchasePrice}`; const supplierName = assignments[key]; if (supplierName) product.orderIds.forEach(orderId => updates.push({ orderId, fields: { supplierName } })); }); if (updates.length > 0) { updateMultipleOrderFields(updates); setShowSaveConfirmation(true); setTimeout(() => setShowSaveConfirmation(false), 3000); } else { alert('მომწოდებლების სახელები არ არის შეყვანილი.'); } };
    if (!processedOrders || processedOrders.length === 0) { return (<div className="text-center p-6 bg-white rounded-lg shadow-md"><h2 className="text-xl font-bold mb-4">დამუშავებული შეკვეთები არ არის</h2><p>გთხოვთ, დაბრუნდეთ უკან და დაამუშავოთ შეკვეთები.</p><button onClick={onBack} className="mt-4 py-2 px-4 bg-gray-500 text-white rounded-md hover:bg-gray-600">&larr; {t.back}</button></div>); }
    return (<div className="space-y-6"><Toast message={t.purchaseSaved} show={showSaveConfirmation} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>} /><div className="flex justify-between items-center"><h2 className="text-xl font-bold">{t.supplierAssignment} - {new Date(forDate).toLocaleDateString()}</h2><button onClick={onBack} className="py-2 px-4 bg-gray-500 text-white rounded-md hover:bg-gray-600">&larr; {t.back}</button></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="bg-white p-4 rounded-lg shadow-md border"><h3 className="font-bold mb-3">{t.assignSuppliers}</h3><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{[t.product, t.totalQty, t.supplierName].map(h=><th key={h} className="p-2 text-left text-xs font-medium text-gray-600 uppercase">{h}</th>)}</tr></thead><tbody>{aggregatedProducts.map(product => { const key = `${product.ProductSKU}-${product.purchasePrice}`; return (<tr key={key} className="border-b"><td className="p-2">{product.ProductName}</td><td className="p-2">{product.totalQuantity.toFixed(2)} kg</td><td className="p-2"><input type="text" placeholder="შეიყვანეთ მომწოდებელი..." value={assignments[key] || ''} onChange={(e) => handleSupplierChange(key, e.target.value)} className="w-full p-1 border rounded" /></td></tr>)})}</tbody></table></div></div><div className="bg-white p-4 rounded-lg shadow-md border"><h3 className="font-bold mb-3">{t.notesPayableSummary}</h3><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>{[t.supplier, t.totalAmountOwed].map(h=><th key={h} className="p-2 text-left text-xs font-medium text-gray-600 uppercase">{h}</th>)}</tr></thead><tbody>{notesPayable.map(([supplier, total]) => (<tr key={supplier} className="border-b"><td className="p-2 font-semibold">{supplier}</td><td className="p-2 font-semibold">${total.toFixed(2)}</td></tr>))}{notesPayable.length === 0 && <tr><td colSpan="2" className="text-center p-4 text-gray-500">{t.assignToSeeSummary}</td></tr>}</tbody></table></div></div></div><div className="text-center"><button onClick={handleSaveAssignments} className="py-2 px-6 bg-blue-600 text-white rounded-md hover:bg-blue-700">{t.saveSupplierAssignments}</button></div></div>);
};

const AccountsPayablePage = () => {
    const { orders, payments, addPayment } = useData(); const [isModalOpen, setIsModalOpen] = useState(false); const [selectedSupplier, setSelectedSupplier] = useState(null); const [paymentAmount, setPaymentAmount] = useState('');
    const summary = useMemo(() => { const purchaseTotals = {}; orders.forEach(o => { if (o.supplierName && o.purchasePrice && o.Quantity) { if (!purchaseTotals[o.supplierName]) purchaseTotals[o.supplierName] = 0; purchaseTotals[o.supplierName] += o.purchasePrice * o.Quantity; }}); const paymentTotals = {}; payments.forEach(p => { if (!paymentTotals[p.supplierName]) paymentTotals[p.supplierName] = 0; paymentTotals[p.supplierName] += p.amount; }); const allSuppliers = new Set([...Object.keys(purchaseTotals), ...Object.keys(paymentTotals)]); return Array.from(allSuppliers).map(supplier => ({ supplier, totalPurchased: purchaseTotals[supplier] || 0, totalPaid: paymentTotals[supplier] || 0, balance: (purchaseTotals[supplier] || 0) - (paymentTotals[supplier] || 0) })).sort((a,b) => a.supplier.localeCompare(b.supplier)); }, [orders, payments]);
    const handleRecordPaymentClick = (supplier) => { setSelectedSupplier(supplier); setIsModalOpen(true); }; const handleModalClose = () => { setIsModalOpen(false); setSelectedSupplier(null); setPaymentAmount(''); };
    const handlePaymentSubmit = () => { const amount = parseFloat(paymentAmount); if (!amount || amount <= 0) { alert('მიუთითეთ ვალიდური თანხა.'); return; } addPayment({ supplierName: selectedSupplier, amount: amount, paymentDate: new Date() }); alert(`გადახდა $${amount.toFixed(2)} მომწოდებელზე ${selectedSupplier} დაფიქსირდა.`); handleModalClose(); };
    return (<div className="bg-white p-6 rounded-lg shadow-md border"><h2 className="text-xl font-bold mb-4">{t.accountsPayable}</h2><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{[t.supplier, t.totalPurchased, t.totalPaid, t.balanceOwed, t.actions].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody className="bg-white divide-y">{summary.map(({ supplier, totalPurchased, totalPaid, balance }) => (<tr key={supplier}><td className="px-4 py-3 font-semibold">{supplier}</td><td className="px-4 py-3">${totalPurchased.toFixed(2)}</td><td className="px-4 py-3">${totalPaid.toFixed(2)}</td><td className={`px-4 py-3 font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>${balance.toFixed(2)}</td><td className="px-4 py-3"><button onClick={() => handleRecordPaymentClick(supplier)} className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600">{t.recordPayment}</button></td></tr>))}{summary.length === 0 && <tr><td colSpan="5" className="text-center p-4 text-gray-500">მომწოდებლების მონაცემები არ არის.</td></tr>}</tbody>
    </table></div><Modal isOpen={isModalOpen} onClose={handleModalClose} title={`${t.recordPayment} - ${selectedSupplier}`}><div className="space-y-4"><label className="block">{t.paymentAmount}:</label><input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" className="w-full p-2 border rounded-md"/><div className="text-right"><button onClick={handlePaymentSubmit} className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700">{t.submitPayment}</button></div></div></Modal></div>);
};

// --- Admin: Delivery Check ---
const DeliveryCheckPage = () => {
    const { orders } = useData();
    const [deliveries, setDeliveries] = useState([]);

    const comparison = useMemo(() => {
        const totals = {};
        orders.filter(o => o.OrderStatus === 'Completed').forEach(o => {
            const key = `${o.OrderDate.toISOString().split('T')[0]}-${normalizeName(o.CustomerName)}`;
            if (!totals[key]) totals[key] = 0;
            totals[key] += o.TotalPrice || (o.Quantity * (o.salesPrice || o.UnitPrice || 0));
        });
        return deliveries.map(d => {
            const key = `${d.date}-${normalizeName(d.customer)}`;
            const orderTotal = totals[key] || 0;
            return { ...d, orderTotal, diff: orderTotal - d.total };
        });
    }, [deliveries, orders]);

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file || !window.XLSX) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const wb = window.XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });

            const parsedRows = rows.slice(1).map(r => {
                const dateObj = parseExcelDate(r[0]);
                if (!dateObj || isNaN(dateObj.getTime())) return null;
                return {
                    date: dateObj.toISOString().split('T')[0],
                    customer: r[1] ? String(r[1]).trim() : '',
                    total: parseFloat(r[2]) || 0
                };
            }).filter(r => r && r.customer);

            const aggregated = {};
            parsedRows.forEach(r => {
                const key = `${r.date}-${normalizeName(r.customer)}`;
                if (!aggregated[key]) {
                    aggregated[key] = { date: r.date, customer: r.customer, total: 0 };
                }
                aggregated[key].total += r.total;
            });

            setDeliveries(Object.values(aggregated));
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border">
            <h2 className="text-xl font-bold mb-4">{t.deliveryCheck}</h2>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="mb-4" />
            {comparison.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2">{t.date}</th>
                                <th className="px-3 py-2">{t.customer}</th>
                                <th className="px-3 py-2">{t.ordersTotal}</th>
                                <th className="px-3 py-2">{t.deliveriesTotal}</th>
                                <th className="px-3 py-2">{t.difference}</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y">
                            {comparison.map((row, i) => (
                                <tr key={i}>
                                    <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                                    <td className="px-3 py-2">{row.customer}</td>
                                    <td className="px-3 py-2">${row.orderTotal.toFixed(2)}</td>
                                    <td className="px-3 py-2">${row.total.toFixed(2)}</td>
                                    <td className={`px-3 py-2 font-bold ${row.diff === 0 ? 'text-green-600' : 'text-red-600'}`}>${row.diff.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <p>{t.noDataFound}</p>}
        </div>
    );
};

// ============================================================================
// 5. TOP-LEVEL APPLICATION COMPONENTS
// ============================================================================
const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState('');
  
  const [processedOrders, setProcessedOrders] = useState(null);
  const [processedDate, setProcessedDate] = useState(null);
  const [prefillOrder, setPrefillOrder] = useState(null);
  const [orderSummaryDate, setOrderSummaryDate] = useState(null);

  const [fontSizeIndex, setFontSizeIndex] = useState(1);

  useEffect(() => {
    document.documentElement.className = '';
    document.documentElement.classList.add(FONT_SIZES[fontSizeIndex]);
  }, [fontSizeIndex]);

  const increaseFontSize = () => setFontSizeIndex(i => Math.min(i + 1, FONT_SIZES.length - 1));
  const decreaseFontSize = () => setFontSizeIndex(i => Math.max(i - 1, 0));

  const navigateToSupplierAssignment = (orders, date) => {
    setProcessedOrders(orders); setProcessedDate(date); setActiveView('assign-suppliers');
  };

  const navigateToOrderSummary = (date) => {
    setOrderSummaryDate(date); setActiveView('order-summary');
  };

  // Reset orderSummaryDate when navigating away from order-summary
  useEffect(() => {
    if (activeView !== 'order-summary') {
      setOrderSummaryDate(null);
    }
  }, [activeView]);

  const renderActiveView = () => {
    if (!user) return null;
    switch (activeView) {
      case 'user-management': return user.role === 'Admin' ? <UserManagementPage /> : null;
      case 'add-product': return user.role === 'Admin' ? <AddProductPage /> : null;
      case 'manage-products': return user.role === 'Admin' ? <ManageProductsPage /> : null;
      case 'manage-customers': return user.role === 'Admin' ? <ManageCustomersPage /> : null;
      case 'add-customer': return <AddCustomerPage />;
      case 'add-order':
        return user.role === 'Seller' ? <AddOrderPage prefillOrder={prefillOrder} onPrefillConsumed={() => setPrefillOrder(null)} onNavigateToSummary={navigateToOrderSummary} /> : null;
      case 'order-summary':
        return user.role === 'Seller' || user.role === 'Purchase Manager' || user.role === 'Admin' ? <OrderSummaryPage onRepeat={(order) => { setPrefillOrder(order); setActiveView('add-order'); }} initialDate={orderSummaryDate} /> : null;
      case 'orders-for-purchase': return user.role === 'Purchase Manager' ? <OrdersForPurchasePage onDone={navigateToSupplierAssignment} /> : null;
      case 'aggregated-orders': return user.role === 'Purchase Manager' ? <AggregatedOrdersPage /> : null;
      case 'assign-suppliers': return user.role === 'Purchase Manager' ? <SupplierAssignmentPage processedOrders={processedOrders} forDate={processedDate} onBack={() => setActiveView('orders-for-purchase')} /> : null;
      case 'accounts-payable': return user.role === 'Purchase Manager' ? <AccountsPayablePage /> : null;
      case 'delivery-check': return user.role === 'Admin' ? <DeliveryCheckPage /> : null;
      case 'rs-api-management': return (user.role === 'Admin' || user.role === 'Purchase Manager') ? <RSApiManagementPage /> : null;
      case 'customer-analysis': return (user.role === 'Admin' || user.role === 'Purchase Manager') ? <CustomerAnalysisPage /> : null;
      case 'inventory-management': return (user.role === 'Admin' || user.role === 'Purchase Manager') ? <InventoryManagementPage /> : null;
      default:
        return <div className="p-6 bg-white rounded-lg shadow-md border"><h2 className="text-xl font-semibold">{t.welcome}, {user.name}!</h2><p className="text-gray-600 mt-2">{t.selectOption}</p></div>;
    }
  };

  const navLinks = {
    Admin: [
        { label: t.userManagement, view: 'user-management' },
        { label: t.addProduct, view: 'add-product' },
        { label: t.manageProducts, view: 'manage-products' },
        { label: t.manageCustomers, view: 'manage-customers' },
        { label: t.orderSummary, view: 'order-summary' },
        { label: t.deliveryCheck, view: 'delivery-check' },
        { label: t.rsApiManagement, view: 'rs-api-management' },
        { label: 'მომხმარებელთა ანალიზი', view: 'customer-analysis' },
        { label: 'ინვენტარიზაციის მართვა', view: 'inventory-management' },
    ],
    Seller: [{ label: t.addOrder, view: 'add-order' }, { label: t.orderSummary, view: 'order-summary' }, { label: t.addCustomer, view: 'add-customer' }],
  'Purchase Manager': [
      { label: t.ordersForPurchase, view: 'orders-for-purchase' },
      { label: t.aggregatedOrders, view: 'aggregated-orders' },
      { label: t.orderSummary, view: 'order-summary' },
      { label: t.accountsPayable, view: 'accounts-payable' },
      { label: t.addCustomer, view: 'add-customer' },
      { label: t.rsApiManagement, view: 'rs-api-management' },
      { label: 'მომხმარებელთა ანალიზი', view: 'customer-analysis' },
      { label: 'ინვენტარიზაციის მართვა', view: 'inventory-management' }
  ],
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2 md:space-x-4">
              <span className="font-bold text-lg md:text-xl text-blue-700">{t.appName}</span>
              <div className="hidden md:flex items-baseline space-x-1">
                {user && navLinks[user.role] && navLinks[user.role].map(link => (
                  <button key={link.view} onClick={() => setActiveView(link.view)} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeView === link.view ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>{link.label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
               <div className="flex items-center border rounded-md"><button onClick={decreaseFontSize} className="px-2 py-1 text-lg font-bold leading-none border-r hover:bg-gray-100">-A</button><button onClick={increaseFontSize} className="px-2 py-1 text-lg font-bold leading-none hover:bg-gray-100">+A</button></div>
               <span className="hidden sm:block text-sm text-gray-500">{t.role}: <span className="font-bold text-gray-800">{user.role}</span></span>
               <button onClick={logout} className="px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 font-semibold transition-colors">{t.logout}</button>
            </div>
          </div>
           <div className="md:hidden flex flex-wrap items-baseline space-x-2 py-2 border-t">
              {user && navLinks[user.role] && navLinks[user.role].map(link => (
                <button key={link.view} onClick={() => setActiveView(link.view)} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeView === link.view ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>{link.label}</button>
              ))}
            </div>
        </div>
      </nav>
      <main><div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{renderActiveView()}</div></main>
    </div>
  );
};

const LoginPage = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
      e.preventDefault(); setError(''); setLoading(true);
      try { await login(email, password); } 
      catch (err) { setError("ელ. ფოსტა ან პაროლი არასწორია."); }
      setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="p-8 bg-white rounded-xl shadow-2xl text-center w-full max-w-sm mx-4">
        <h1 className="text-3xl font-bold mb-2 text-gray-800">{t.appName}</h1>
        <p className="text-gray-500 mb-8">{t.loginTitle}</p>
        <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.email} required className="w-full px-4 py-2 border border-gray-300 rounded-md"/>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.password} required className="w-full px-4 py-2 border border-gray-300 rounded-md"/>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full px-4 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400">{loading ? '...' : t.login}</button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [error, setError] = useState(null);
  
  // Effect to load the xlsx script for Excel export
  useEffect(() => {
      try {
          const script = document.createElement('script');
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          script.async = true;
          script.onload = () => console.log('XLSX library loaded successfully');
          script.onerror = () => console.warn('XLSX library failed to load');
          document.body.appendChild(script);
          return () => {
              try {
                  document.body.removeChild(script);
              } catch (e) {
                  // Script might have been removed already
              }
          }
      } catch (err) {
          console.error('Error loading XLSX script:', err);
      }
  }, []);

  // Error boundary
  useEffect(() => {
      const handleError = (event) => {
          console.error('Application error:', event.error);
          setError(event.error?.message || 'An unexpected error occurred');
      };
      
      window.addEventListener('error', handleError);
      return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
      return (
          <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: 'red',
              fontFamily: 'Arial, sans-serif'
          }}>
              <h1>Application Error</h1>
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>
                  Reload Page
              </button>
          </div>
      );
  }

  try {
      return (
          <AuthProvider>
              <DataProvider>
                  <MainController />
              </DataProvider>
          </AuthProvider>
      );
  } catch (err) {
      console.error('App render error:', err);
      return (
          <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: 'red',
              fontFamily: 'Arial, sans-serif'
          }}>
              <h1>Application Failed to Load</h1>
              <p>Error: {err.message}</p>
              <p>Please check the browser console for more details.</p>
              <button onClick={() => window.location.reload()}>
                  Reload Page
              </button>
          </div>
      );
  }
}

function MainController() {
  const { user, loading } = useAuth();
  
  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
              <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">იტვირთება...</p>
              </div>
          </div>
      );
  }

  try {
      return user ? <Dashboard /> : <LoginPage />;
  } catch (err) {
      console.error('MainController error:', err);
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
              <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                  <h1 className="text-xl font-bold text-red-600 mb-4">Application Error</h1>
                  <p className="text-gray-600 mb-4">Failed to load the main application.</p>
                  <button 
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                      Reload Application
                  </button>
              </div>
          </div>
      );
  }
}

export default App;

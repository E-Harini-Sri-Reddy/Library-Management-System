import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Users, 
  Clock, 
  TrendingUp, 
  Plus, 
  MoreHorizontal, 
  Edit2, 
  Trash2,
  Settings,
  LayoutDashboard,
  BarChart3,
  X,
  Loader2,
  Search,
  Download,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  History,
  Book,
  RefreshCw,
  Image as ImageIcon,
  Bell,
  Lock
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { ChangePassword } from './ChangePassword';
import { LibraryService } from '../services/LibraryService';
import { GoogleGenAI } from "@google/genai";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'forecast' | 'help' | 'borrowings' | 'fines'>('dashboard');
  const [books, setBooks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [borrowings, setBorrowings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  
  // Borrowing filter state
  const [borrowingFilter, setBorrowingFilter] = useState<'all' | 'active' | 'returned'>('all');
  
  // Fines Report state
  const [finesSortField, setFinesSortField] = useState<'name' | 'amount'>('amount');
  const [finesSortOrder, setFinesSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Modal states
  const [showBookModal, setShowBookModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [inlineEditingUserId, setInlineEditingUserId] = useState<number | null>(null);
  const [inlineDisplayName, setInlineDisplayName] = useState('');
  const [inlineMembership, setInlineMembership] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookSortField, setBookSortField] = useState<'title' | 'author' | 'category' | 'id'>('id');
  const [bookSortOrder, setBookSortOrder] = useState<'asc' | 'desc'>('asc');
  const [userSortField, setUserSortField] = useState<'username' | 'displayName' | 'membership' | 'id' | 'joinDate'>('id');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Forecast state
  const [forecastData, setForecastData] = useState<any>(null);
  const [demandForecast, setDemandForecast] = useState<any[]>([]);
  const [historicalData, setHistoricalData] = useState<{month: string, count: number}[]>([]);
  const [isForecasting, setIsForecasting] = useState(false);
  const [isDemandForecasting, setIsDemandForecasting] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState({ 
    refreshRate: '60', 
    autoRefresh: 'true',
    libraryName: 'SLMS',
    fineRate: '10',
    maxBorrowLimit: '5',
    borrowDurationDays: '14'
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (globalSettings && globalSettings.autoRefresh === 'true') {
      const rate = parseInt(globalSettings.refreshRate) || 60;
      const interval = setInterval(fetchData, rate * 1000);
      return () => clearInterval(interval);
    }
  }, [globalSettings]);

  useEffect(() => {
    if (historicalData.length >= 5 && !forecastData && !isForecasting) {
      handleForecast();
    }
  }, [historicalData]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [booksData, usersData, historyData, borrowingsData, demandForecastData, settingsData] = await Promise.all([
        LibraryService.getBooks(),
        LibraryService.getUsers(),
        LibraryService.getBorrowingHistory(),
        LibraryService.getAllBorrowings(),
        LibraryService.getDemandForecast(),
        LibraryService.getSettings()
      ]);
      setBooks(booksData);
      setUsers(usersData);
      setHistoricalData(historyData);
      setBorrowings(borrowingsData);
      setDemandForecast(demandForecastData);
      
      const mergedSettings = settingsData || {
        refreshRate: '60', 
        autoRefresh: 'true',
        libraryName: 'SLMS',
        fineRate: '10',
        maxBorrowLimit: '5',
        borrowDurationDays: '14'
      };
      setGlobalSettings(mergedSettings);
      
      // Notify parent about library name if it changed
      if (mergedSettings.libraryName && (window as any).onLibraryNameChange) {
        (window as any).onLibraryNameChange(mergedSettings.libraryName);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const title = formData.get('title') as string;
    const author = formData.get('author') as string;
    let coverUrl = formData.get('coverUrl') as string;

    if (!coverUrl && !editingBook) {
      setIsGeneratingCover(true);
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('GEMINI_API_KEY is not set');
        }
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: `Generate a professional and artistic book cover for a book titled "${title}" by ${author}. The design should be clean, modern, and relevant to the title. No text on the cover, just the artwork.`,
              },
            ],
          },
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            coverUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      } catch (error) {
        console.error('Failed to generate cover:', error);
      } finally {
        setIsGeneratingCover(false);
      }
    }

    const book = {
      title,
      author,
      category: formData.get('category') as string,
      totalQuantity: parseInt(formData.get('totalQuantity') as string) || 1,
      coverUrl,
    };

    try {
      if (editingBook) {
        const res = await LibraryService.updateBook(editingBook.id, { ...book, status: editingBook.status });
        if (res.success) {
          showToast('Book updated successfully!', 'success');
        } else {
          showToast(res.error || 'Failed to update book', 'error');
        }
      } else {
        const res = await LibraryService.addBook(book);
        if (res.success) {
          showToast('Book added successfully!', 'success');
        } else {
          showToast(res.error || 'Failed to add book', 'error');
        }
      }
      setShowBookModal(false);
      setEditingBook(null);
      fetchData();
    } catch (error: any) {
      console.error('Book operation failed:', error);
      showToast(error.message || 'An error occurred during book operation', 'error');
    }
  };

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const res = await LibraryService.checkMembershipStatus();
      if (res.success) {
        showToast('Membership status refreshed successfully!', 'success');
        fetchData();
      } else {
        showToast(res.error || 'Failed to check membership status', 'error');
      }
    } catch (error) {
      console.error('Check status failed:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const user = {
      username: formData.get('username') as string,
      email: formData.get('email') as string,
      displayName: formData.get('displayName') as string,
      role: formData.get('role') as string,
      membership: formData.get('membership') as string,
      joinDate: formData.get('joinDate') as string,
      membershipExpiry: formData.get('membershipExpiry') as string,
    };

    try {
      if (editingUser) {
        if (editingUser.username === 'admin') {
          user.role = 'admin';
          user.membership = 'Active';
          user.username = 'admin';
        }
        const res = await LibraryService.updateUser(editingUser.id, user);
        if (res.success) {
          showToast('User updated successfully!', 'success');
        } else {
          showToast(res.error || 'Failed to update user', 'error');
        }
      } else {
        // For new users, default password is username
        const res = await LibraryService.addUser({ ...user, password: user.username });
        if (res.success) {
          showToast('User added successfully!', 'success');
        } else {
          showToast(res.error || 'Failed to add user', 'error');
        }
      }
      setShowUserModal(false);
      setEditingUser(null);
      fetchData();
    } catch (error: any) {
      console.error('User operation failed:', error);
      showToast(error.message || 'An error occurred during user operation', 'error');
    }
  };

  const handleInlineUpdate = async (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (user.username === 'admin') {
      showToast('Default admin account membership cannot be modified.', 'error');
      setInlineEditingUserId(null);
      return;
    }

    try {
      const res = await LibraryService.updateUser(userId, {
        ...user,
        displayName: inlineDisplayName,
        membership: inlineMembership
      });
      if (res.success) {
        showToast('User updated successfully!', 'success');
        setInlineEditingUserId(null);
        fetchData();
      } else {
        showToast(res.error || 'Failed to update user', 'error');
      }
    } catch (error: any) {
      console.error('Failed to update user inline:', error);
      showToast(error.message || 'Failed to update user', 'error');
    }
  };

  const handleDeleteBook = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this book?')) {
      try {
        const res = await LibraryService.deleteBook(id);
        if (res.success) {
          showToast('Book deleted successfully!', 'success');
          fetchData();
        } else {
          showToast(res.error || 'Failed to delete book', 'error');
        }
      } catch (error: any) {
        showToast(error.message || 'Failed to delete book', 'error');
      }
    }
  };

  const handleDeleteUser = async (id: number) => {
    const user = users.find(u => u.id === id);
    if (user && user.username === 'admin') {
      showToast('Default admin account cannot be deleted.', 'error');
      return;
    }
    if (window.confirm('Are you sure you want to delete this member?')) {
      try {
        const res = await LibraryService.deleteUser(id);
        if (res.success) {
          showToast('User deleted successfully!', 'success');
          fetchData();
        } else {
          showToast(res.error || 'Failed to delete user', 'error');
        }
      } catch (error: any) {
        showToast(error.message || 'Failed to delete user', 'error');
      }
    }
  };

  const handleForecast = async () => {
    if (historicalData.length < 3) {
      showToast('Insufficient data for forecasting. Need at least 3 months of history.', 'info');
      return;
    }
    
    setIsForecasting(true);
    setForecastError(null);
    try {
      const counts = historicalData.map(d => d.count);
      const res = await LibraryService.getForecast(counts);
      if (res.error) {
        setForecastError(res.error + (res.details ? `: ${res.details}` : ''));
      } else {
        if (res.warning) {
          console.warn('Forecast warning:', res.warning);
        }
        setForecastData(res);
      }

      // Also refresh demand forecast
      setIsDemandForecasting(true);
      const demandResult = await LibraryService.getDemandForecast();
      setDemandForecast(demandResult);
    } catch (error: any) {
      console.error('Forecasting failed:', error);
      setForecastError(error.message || 'An unexpected error occurred during forecasting');
    } finally {
      setIsForecasting(false);
      setIsDemandForecasting(false);
    }
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const val = row[header];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllData = async () => {
    try {
      // Fetch full borrowings table
      const fullBorrowings = await LibraryService.getAllBorrowings();
      
      // Download Books
      downloadCSV(books, 'library_books.csv');
      // Download Users
      downloadCSV(users, 'library_users.csv');
      // Download Full Borrowings
      downloadCSV(fullBorrowings, 'library_borrowings_full.csv');
      // Download Historical Borrowings Summary
      downloadCSV(historicalData, 'borrowing_history_summary.csv');
      
      // Download Forecast if available
      if (forecastData && forecastData.forecast) {
        const forecastRows = forecastData.forecast.map((v: number, i: number) => {
          const lastMonth = historicalData[historicalData.length - 1]?.month || new Date().toISOString().substring(0, 7);
          const nextDate = new Date(lastMonth + '-01');
          nextDate.setMonth(nextDate.getMonth() + i + 1);
          return { 
            month: nextDate.toISOString().substring(0, 7), 
            predicted_count: Math.max(0, Math.round(v)) 
          };
        });
        downloadCSV(forecastRows, 'borrowing_forecast.csv');
      }
    } catch (error) {
      console.error('Failed to export all data:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const handleSortBooks = (field: 'title' | 'author' | 'category' | 'id') => {
    if (bookSortField === field) {
      setBookSortOrder(bookSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setBookSortField(field);
      setBookSortOrder('asc');
    }
  };

  const handleSortUsers = (field: 'username' | 'displayName' | 'membership' | 'id' | 'joinDate') => {
    if (userSortField === field) {
      setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortField(field);
      setUserSortOrder('asc');
    }
  };

  const filteredAndSortedBooks = books
    .filter(b => 
      b.title.toLowerCase().includes(bookSearchQuery.toLowerCase()) ||
      b.author.toLowerCase().includes(bookSearchQuery.toLowerCase()) ||
      b.category.toLowerCase().includes(bookSearchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aValue = a[bookSortField];
      const bValue = b[bookSortField];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return bookSortOrder === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      return bookSortOrder === 'asc' ? (aValue - bValue) : (bValue - aValue);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
          toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
          'bg-blue-50 border-blue-100 text-blue-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-emerald-500" size={20} /> :
           toast.type === 'error' ? <AlertCircle className="text-red-500" size={20} /> :
           <Bell className="text-blue-500" size={20} />}
          <p className="font-bold text-sm">{toast.message}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          } flex items-center gap-2`}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('forecast')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'forecast' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          } flex items-center gap-2`}
        >
          <BarChart3 size={18} />
          Demand Forecast
        </button>
        <button
          onClick={() => setActiveTab('borrowings')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'borrowings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          } flex items-center gap-2`}
        >
          <History size={18} />
          Borrowing Records
        </button>
        <button
          onClick={() => setActiveTab('fines')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'fines' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          } flex items-center gap-2`}
        >
          <AlertCircle size={18} />
          Fines Report
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'settings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          } flex items-center gap-2`}
        >
          <Settings size={18} />
          Settings
        </button>
        <button
          onClick={() => setActiveTab('help')}
          className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'help' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          } flex items-center gap-2`}
        >
          <HelpCircle size={18} />
          Help/FAQ
        </button>
        <div className="ml-auto flex items-center px-4">
          <button 
            onClick={handleDownloadAllData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} />
            Export All Data (CSV)
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard 
              icon={<BookOpen size={24} />} 
              title="Total Copies" 
              value={books.reduce((acc, b) => acc + (b.totalQuantity || 0), 0).toString()} 
              color="bg-blue-50 text-blue-600" 
            />
            <StatCard 
              icon={<TrendingUp size={24} />} 
              title="Books Issued" 
              value={books.reduce((acc, b) => acc + ((b.totalQuantity || 0) - (b.availableQuantity || 0)), 0).toString()} 
              color="bg-pink-50 text-pink-600" 
            />
            <StatCard icon={<Clock size={24} />} title="Overdue Books" value={borrowings.filter(b => b.status === 'Borrowed' && new Date(b.dueDate) < new Date()).length.toString()} color="bg-orange-50 text-orange-600" />
            <StatCard icon={<Users size={24} />} title="Total Members" value={users.length.toString()} color="bg-emerald-50 text-emerald-600" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Manage Books */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                  <h3 className="font-semibold text-slate-800 whitespace-nowrap">Manage Books</h3>
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search books by title, author, or category..." 
                      value={bookSearchQuery}
                      onChange={(e) => setBookSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button 
                  onClick={() => { setEditingBook(null); setShowBookModal(true); }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shrink-0"
                >
                  <Plus size={16} /> Add Book
                </button>
              </div>
              <div className="overflow-auto max-h-[450px] custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortBooks('id')}>ID</th>
                      <th className="px-6 py-3 font-medium bg-slate-50">Cover</th>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortBooks('title')}>Title</th>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortBooks('author')}>Author</th>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortBooks('category')}>Category</th>
                      <th className="px-6 py-3 font-medium bg-slate-50">Status</th>
                      <th className="px-6 py-3 font-medium bg-slate-50">Qty (Avail/Total)</th>
                      <th className="px-6 py-3 font-medium bg-slate-50">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAndSortedBooks.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-500">{book.id}</td>
                        <td className="px-6 py-4">
                          {book.coverUrl ? (
                            <img src={book.coverUrl} alt={book.title} className="w-10 h-14 object-cover rounded shadow-sm" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-10 h-14 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                              <Book size={16} />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">{book.title}</td>
                        <td className="px-6 py-4 text-slate-600">{book.author}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {book.category.split(',').map((cat: string, idx: number) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                                {cat.trim()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {book.availableQuantity > 0 ? (
                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Available</span>
                          ) : (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Reserved</span>
                          )}
                          {book.availableQuantity < book.totalQuantity && book.availableQuantity > 0 && (
                            <span className="ml-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Borrowed</span>
                          )}
                          {book.availableQuantity === 0 && (
                            <span className="ml-1 px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold uppercase tracking-wider">All Out</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {book.availableQuantity} / {book.totalQuantity}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => { setEditingBook(book); setShowBookModal(true); }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteBook(book.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Manage Members */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                  <h3 className="font-semibold text-slate-800 whitespace-nowrap">Manage Members</h3>
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search members by name, email, or username..." 
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleCheckStatus}
                    disabled={isCheckingStatus}
                    className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-200 transition-colors shrink-0 disabled:opacity-50"
                    title="Re-verify all membership statuses based on expiry dates"
                  >
                    {isCheckingStatus ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Refresh
                  </button>
                  <button 
                    onClick={() => { setEditingUser(null); setShowUserModal(true); }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shrink-0"
                  >
                    <Plus size={16} /> Add Member
                  </button>
                </div>
              </div>
              <div className="overflow-auto max-h-[450px] custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortUsers('id')}>
                        ID {userSortField === 'id' && (userSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortUsers('displayName')}>
                        Name {userSortField === 'displayName' && (userSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortUsers('membership')}>
                        Membership {userSortField === 'membership' && (userSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600 bg-slate-50" onClick={() => handleSortUsers('joinDate')}>
                        Join Date {userSortField === 'joinDate' && (userSortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-6 py-3 font-medium bg-slate-50">Expiry Date</th>
                      <th className="px-6 py-3 font-medium bg-slate-50">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users
                      .filter(u => 
                        u.username.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                        (u.displayName && u.displayName.toLowerCase().includes(memberSearchQuery.toLowerCase())) ||
                        u.email.toLowerCase().includes(memberSearchQuery.toLowerCase())
                      )
                      .sort((a, b) => {
                        const aValue = a[userSortField] || '';
                        const bValue = b[userSortField] || '';
                        if (typeof aValue === 'string' && typeof bValue === 'string') {
                          return userSortOrder === 'asc' 
                            ? aValue.localeCompare(bValue) 
                            : bValue.localeCompare(aValue);
                        }
                        return userSortOrder === 'asc' ? (aValue - bValue) : (bValue - aValue);
                      })
                      .map((member) => (
                        <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-500">{member.id}</td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {inlineEditingUserId === member.id ? (
                            <input
                              type="text"
                              value={inlineDisplayName}
                              onChange={(e) => setInlineDisplayName(e.target.value)}
                              className="w-full px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                              autoFocus
                            />
                          ) : (
                            member.displayName || member.username
                          )}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {inlineEditingUserId === member.id && member.username !== 'admin' ? (
                            <select
                              value={inlineMembership}
                              onChange={(e) => setInlineMembership(e.target.value)}
                              className="px-2 py-1 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                              <option value="Suspended">Suspended</option>
                            </select>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold inline-block w-fit ${
                                member.membership === 'Active' ? 'bg-emerald-50 text-emerald-600' : 
                                member.membership === 'Suspended' ? 'bg-orange-50 text-orange-600' :
                                'bg-red-50 text-red-600'
                              }`}>
                                {member.username === 'admin' ? 'Active (Lifetime)' : member.membership}
                              </span>
                              {member.membership === 'Active' && member.membershipExpiry && new Date(member.membershipExpiry) < new Date() && (
                                <span className="text-[10px] text-red-500 font-bold animate-pulse">
                                  Expired!
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{member.joinDate || '-'}</td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{member.membershipExpiry || '-'}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            {inlineEditingUserId === member.id ? (
                              <>
                                <button 
                                  onClick={() => handleInlineUpdate(member.id)}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                  title="Save"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                                <button 
                                  onClick={() => setInlineEditingUserId(null)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Cancel"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button 
                                  onClick={() => {
                                    setInlineEditingUserId(member.id);
                                    setInlineDisplayName(member.displayName || member.username);
                                    setInlineMembership(member.membership);
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Quick Edit"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={() => { setEditingUser(member); setShowUserModal(true); }}
                                  className="p-1.5 text-slate-600 hover:bg-slate-50 rounded transition-colors"
                                  title="Full Edit"
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(member.id)}
                                  disabled={member.username === 'admin'}
                                  className={`p-1.5 rounded transition-colors ${member.username === 'admin' ? 'text-slate-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                                  title={member.username === 'admin' ? "Cannot delete default admin" : "Delete"}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : activeTab === 'borrowings' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-slate-800">All Borrowing Records</h3>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setBorrowingFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${borrowingFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setBorrowingFilter('active')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${borrowingFilter === 'active' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Active
                </button>
                <button 
                  onClick={() => setBorrowingFilter('returned')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${borrowingFilter === 'returned' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Returned
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">
                {borrowings.filter(r => {
                  if (borrowingFilter === 'active') return r.status === 'Borrowed';
                  if (borrowingFilter === 'returned') return r.status === 'Returned';
                  return true;
                }).length} records
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-medium">Borrower</th>
                  <th className="px-6 py-3 font-medium">Book Title</th>
                  <th className="px-6 py-3 font-medium">Borrow Date</th>
                  <th className="px-6 py-3 font-medium">Due Date</th>
                  <th className="px-6 py-3 font-medium">Return Date</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {borrowings.filter(r => {
                  if (borrowingFilter === 'active') return r.status !== 'Returned';
                  if (borrowingFilter === 'returned') return r.status === 'Returned';
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No borrowing records found for this filter.</td>
                  </tr>
                ) : (
                  borrowings
                    .filter(r => {
                      if (borrowingFilter === 'active') return r.status !== 'Returned';
                      if (borrowingFilter === 'returned') return r.status === 'Returned';
                      return true;
                    })
                    .map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{record.username}</span>
                          <span className="text-xs text-slate-500">{record.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{record.title}</span>
                          <span className="text-xs text-slate-500">{record.author}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {new Date(record.borrowDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {new Date(record.dueDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {record.returnDate ? new Date(record.returnDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          record.status === 'Returned' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : new Date(record.dueDate) < new Date()
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}>
                          {record.status === 'Returned' ? 'Returned' : (new Date(record.dueDate) < new Date() ? 'Overdue' : 'Active')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'fines' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Outstanding Fines Report</h3>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">
                Total Fines Owed: ₹{borrowings.reduce((acc, r) => {
                  if (r.status !== 'Returned') {
                    const due = new Date(r.dueDate);
                    const today = new Date();
                    if (today > due) {
                      const diffDays = Math.ceil(Math.abs(today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                      const fineRate = globalSettings ? parseInt(globalSettings.fineRate) : 10;
                      return acc + (diffDays * (fineRate || 10));
                    }
                  }
                  return acc;
                }, 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600" onClick={() => {
                    if (finesSortField === 'name') setFinesSortOrder(finesSortOrder === 'asc' ? 'desc' : 'asc');
                    else { setFinesSortField('name'); setFinesSortOrder('asc'); }
                  }}>
                    Member {finesSortField === 'name' && (finesSortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 font-medium">Overdue Books</th>
                  <th className="px-6 py-3 font-medium cursor-pointer hover:text-blue-600" onClick={() => {
                    if (finesSortField === 'amount') setFinesSortOrder(finesSortOrder === 'asc' ? 'desc' : 'asc');
                    else { setFinesSortField('amount'); setFinesSortOrder('asc'); }
                  }}>
                    Total Fine {finesSortField === 'amount' && (finesSortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(() => {
                  const userFines = borrowings.reduce((acc: any, r) => {
                    if (r.status !== 'Returned') {
                      const due = new Date(r.dueDate);
                      const today = new Date();
                      if (today > due) {
                        const diffDays = Math.ceil(Math.abs(today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                        const fineRate = globalSettings ? parseInt(globalSettings.fineRate) : 10;
                        const fine = diffDays * (fineRate || 10);
                        if (!acc[r.userId]) {
                          acc[r.userId] = { 
                            name: r.username, 
                            email: r.email, 
                            totalFine: 0, 
                            books: [] 
                          };
                        }
                        acc[r.userId].totalFine += fine;
                        acc[r.userId].books.push({ title: r.title, fine, overdueDays: diffDays });
                      }
                    }
                    return acc;
                  }, {});

                  const sortedFines = Object.values(userFines).sort((a: any, b: any) => {
                    if (finesSortField === 'name') {
                      return finesSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
                    }
                    return finesSortOrder === 'asc' ? a.totalFine - b.totalFine : b.totalFine - a.totalFine;
                  });

                  if (sortedFines.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No outstanding fines at the moment.</td>
                      </tr>
                    );
                  }

                  return sortedFines.map((user: any, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{user.name}</span>
                          <span className="text-xs text-slate-500">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {user.books.map((b: any, i: number) => (
                            <div key={i} className="text-xs text-slate-600 flex justify-between gap-4">
                              <span>{b.title} <span className="text-red-500 font-medium ml-1">({b.overdueDays} days)</span></span>
                              <span className="font-medium">₹{b.fine.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-lg font-bold text-red-600">₹{user.totalFine.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Outstanding</span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'forecast' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-800">ARIMA Book Demand Forecasting</h2>
              <p className="text-sm text-slate-500">Predicting future library usage based on real borrowing history.</p>
            </div>
            <div className="flex gap-3">
              {forecastData && (
                <button 
                  onClick={() => {
                    const forecastRows = forecastData.forecast.map((v: number, i: number) => {
                      const lastMonth = historicalData[historicalData.length - 1]?.month || new Date().toISOString().substring(0, 7);
                      const nextDate = new Date(lastMonth + '-01');
                      nextDate.setMonth(nextDate.getMonth() + i + 1);
                      return { 
                        month: nextDate.toISOString().substring(0, 7), 
                        predicted_count: Math.max(0, Math.round(v)) 
                      };
                    });
                    downloadCSV(forecastRows, 'forecast_data.csv');
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download size={16} />
                  Download CSV
                </button>
              )}
              <button 
                onClick={handleForecast}
                disabled={isForecasting || historicalData.length < 5}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isForecasting ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
                Generate Forecast
              </button>
            </div>
          </div>

          {forecastError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3">
              <AlertCircle className="text-red-500 shrink-0" size={20} />
              <p className="text-sm text-red-700">{forecastError}</p>
            </div>
          )}
          
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Total Library Borrowing Trend & Prediction</h3>
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={(() => {
                      const combined = historicalData.map(d => ({
                        month: d.month,
                        actual: d.count,
                        predicted: null as number | null
                      }));

                      if (forecastData && forecastData.forecast) {
                        // Add a bridge point from the last actual to the first prediction for a continuous line
                        const lastActual = combined[combined.length - 1];
                        
                        forecastData.forecast.forEach((v: number, i: number) => {
                          const lastMonth = historicalData[historicalData.length - 1]?.month || new Date().toISOString().substring(0, 7);
                          const nextDate = new Date(lastMonth + '-01');
                          nextDate.setMonth(nextDate.getMonth() + i + 1);
                          const monthStr = nextDate.toISOString().substring(0, 7);
                          
                          combined.push({
                            month: monthStr,
                            actual: null as number | null,
                            predicted: Math.max(0, Math.round(v))
                          });
                        });

                        // Make the first prediction point connect to the last actual point
                        if (lastActual) {
                          const firstPredIndex = combined.findIndex(d => d.predicted !== null);
                          if (firstPredIndex !== -1) {
                            combined[firstPredIndex - 1].predicted = lastActual.actual;
                          }
                        }
                      }
                      return combined;
                    })()}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      dx={-10}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && label) {
                          const actual = payload?.find(p => p.dataKey === 'actual')?.value;
                          const predicted = payload?.find(p => p.dataKey === 'predicted')?.value;
                          return (
                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-lg">
                              <p className="text-sm font-bold text-slate-800 mb-2">{label}</p>
                              <div className="space-y-1">
                                <p className="text-sm text-blue-600">
                                  <span className="font-medium">Actual Borrowings:</span> {actual !== undefined && actual !== null ? actual : 'N/A'}
                                </p>
                                <p className="text-sm text-orange-600">
                                  <span className="font-medium">ARIMA Prediction:</span> {predicted !== undefined && predicted !== null ? predicted : 'N/A'}
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    <Line 
                      type="monotone" 
                      dataKey="actual" 
                      name="Actual Borrowings" 
                      stroke="#3b82f6" 
                      strokeWidth={3} 
                      dot={{ fill: '#3b82f6', r: 4 }} 
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                    <Line 
                      type="monotone" 
                      dataKey="predicted" 
                      name="ARIMA Prediction" 
                      stroke="#f97316" 
                      strokeWidth={3} 
                      strokeDasharray="5 5" 
                      dot={{ fill: '#f97316', r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {forecastData && forecastData.forecast && (
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Predicted Monthly Totals</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {forecastData.forecast.map((v: number, i: number) => {
                    const lastMonth = historicalData[historicalData.length - 1]?.month || new Date().toISOString().substring(0, 7);
                    const nextDate = new Date(lastMonth + '-01');
                    nextDate.setMonth(nextDate.getMonth() + i + 1);
                    const monthStr = nextDate.toISOString().substring(0, 7);
                    return (
                      <div key={i} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                        <p className="text-xs text-slate-500 font-bold mb-1 uppercase">{new Date(monthStr).toLocaleString('default', { month: 'short', year: 'numeric' })}</p>
                        <p className="text-2xl font-black text-orange-600">{Math.max(0, Math.round(v))}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Book-Specific Demand Forecast & Stock Recommendations */}
          <div className="space-y-6 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-800">Book-Specific Demand & Stock Recommendations</h3>
                <p className="text-sm text-slate-500">ARIMA-based predictions for individual titles to optimize inventory.</p>
              </div>
              {isDemandForecasting && (
                <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                  <Loader2 size={16} className="animate-spin" />
                  Analyzing trends...
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Top Demand Books */}
              <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Demand Predictions</h4>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">NEXT MONTH</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                      <tr>
                        <th className="px-4 py-3">Book Title</th>
                        <th className="px-4 py-3 text-center">Current Stock</th>
                        <th className="px-4 py-3 text-center">Recent Activity</th>
                        <th className="px-4 py-3 text-center">Predicted Demand</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {demandForecast.slice(0, 10).map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-800">{item.title}</p>
                            <p className="text-[10px] text-slate-500">{item.author}</p>
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-slate-600">{item.currentStock}</td>
                          <td className="px-4 py-3 text-center text-slate-500">{item.currentBorrowCount} borrows</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-blue-600">{item.predictedDemand}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.recommendation === 'Stock Up' ? (
                              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 mx-auto w-fit">
                                <AlertCircle size={10} /> Stock Up
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 mx-auto w-fit">
                                <CheckCircle2 size={10} /> Sufficient
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stock Recommendations Summary */}
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-xl p-5 text-white shadow-lg">
                  <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <TrendingUp size={20} />
                    Stock Recommendations
                  </h4>
                  <div className="space-y-4">
                    {demandForecast.filter(i => i.recommendation === 'Stock Up').length > 0 ? (
                      demandForecast.filter(i => i.recommendation === 'Stock Up').slice(0, 3).map((item) => (
                        <div key={item.id} className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/20">
                          <p className="text-xs font-bold line-clamp-1">{item.title}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-blue-100">Need: +{item.stockNeeded} copies</span>
                            <span className="text-[10px] bg-white text-blue-700 px-1.5 py-0.5 rounded font-bold">HIGH DEMAND</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 bg-white/5 rounded-lg border border-white/10">
                        <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">Inventory is optimized</p>
                        <p className="text-[10px] text-blue-100 mt-1">No immediate stock-ups needed</p>
                      </div>
                    )}
                    
                    {demandForecast.filter(i => i.recommendation === 'Stock Up').length > 3 && (
                      <p className="text-[10px] text-center text-blue-100 italic">
                        + {demandForecast.filter(i => i.recommendation === 'Stock Up').length - 3} more recommendations
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                    <BarChart3 size={16} className="text-blue-600" />
                    Demand Insights
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Most Demanded Book</span>
                      <span className="font-bold text-slate-800">{demandForecast[0]?.title || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Avg. Predicted Demand</span>
                      <span className="font-bold text-slate-800">
                        {Math.round(demandForecast.reduce((acc, i) => acc + i.predictedDemand, 0) / (demandForecast.length || 1))} units
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Items Needing Stock</span>
                      <span className="font-bold text-orange-600">
                        {demandForecast.filter(i => i.recommendation === 'Stock Up').length} titles
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'help' ? (
        <HelpSection />
      ) : activeTab === 'settings' ? (
        <AdminSettingsSection 
          settings={globalSettings} 
          onUpdate={async (newSettings) => {
            await LibraryService.updateSettings(newSettings);
            fetchData();
          }}
          onManualRefresh={fetchData}
        />
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-slate-800 text-center">Account Settings</h2>
          <ChangePassword />
        </div>
      )}

      {/* Book Modal */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowBookModal(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold text-slate-800 mb-6">{editingBook ? 'Edit Book' : 'Add New Book'}</h3>
            <form onSubmit={handleAddBook} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Title</label>
                <input name="title" defaultValue={editingBook?.title} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Author</label>
                <input name="author" defaultValue={editingBook?.author} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Categories (comma separated)</label>
                <input name="category" defaultValue={editingBook?.category} required placeholder="e.g. Technology, Programming" className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Total Quantity</label>
                <input name="totalQuantity" type="number" min="1" defaultValue={editingBook?.totalQuantity || 1} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Cover Image URL</label>
                <input name="coverUrl" defaultValue={editingBook?.coverUrl} placeholder="https://example.com/cover.jpg" className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={isGeneratingCover} className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                {isGeneratingCover ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generating Cover...
                  </>
                ) : (
                  editingBook ? 'Update Book' : 'Add Book'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowUserModal(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold text-slate-800 mb-6">{editingUser ? 'Edit Member' : 'Add New Member'}</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Username</label>
                <input name="username" defaultValue={editingUser?.username} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Display Name</label>
                <input name="displayName" defaultValue={editingUser?.displayName} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input name="email" type="email" defaultValue={editingUser?.email} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Role</label>
                  <select 
                    name="role" 
                    defaultValue={editingUser?.role || 'user'} 
                    disabled={editingUser?.username === 'admin'}
                    className={`w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${editingUser?.username === 'admin' ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Membership</label>
                  <select 
                    name="membership" 
                    defaultValue={editingUser?.membership || 'Active'} 
                    disabled={editingUser?.username === 'admin'}
                    className={`w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${editingUser?.username === 'admin' ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Join Date</label>
                  <input name="joinDate" type="date" defaultValue={editingUser?.joinDate || new Date().toISOString().split('T')[0]} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Membership Expiry</label>
                  <input name="membershipExpiry" type="date" defaultValue={editingUser?.membershipExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} required className="w-full px-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                {editingUser ? 'Update Member' : 'Add Member'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminSettingsSection({ settings, onUpdate, onManualRefresh }: { settings: any, onUpdate: (s: any) => Promise<void>, onManualRefresh: () => void }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [localRate, setLocalRate] = useState(settings?.refreshRate || '60');
  const [localAuto, setLocalAuto] = useState(settings?.autoRefresh === 'true');
  const [localLibraryName, setLocalLibraryName] = useState(settings?.libraryName || 'SLMS');
  const [localFineRate, setLocalFineRate] = useState(settings?.fineRate || '10');
  const [localMaxBorrow, setLocalMaxBorrow] = useState(settings?.maxBorrowLimit || '5');
  const [localBorrowDuration, setLocalBorrowDuration] = useState(settings?.borrowDurationDays || '14');

  // Sync local state when settings prop changes
  useEffect(() => {
    if (settings) {
      setLocalRate(settings.refreshRate || '60');
      setLocalAuto(settings.autoRefresh === 'true');
      setLocalLibraryName(settings.libraryName || 'SLMS');
      setLocalFineRate(settings.fineRate || '10');
      setLocalMaxBorrow(settings.maxBorrowLimit || '5');
      setLocalBorrowDuration(settings.borrowDurationDays || '14');
    }
  }, [settings]);

  if (!settings) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  const handleSave = async () => {
    setIsUpdating(true);
    
    // Enforce positive values
    const validatedFineRate = (parseInt(localFineRate) || 0) <= 0 ? '1' : localFineRate;
    const validatedMaxBorrow = (parseInt(localMaxBorrow) || 0) <= 0 ? '1' : localMaxBorrow;
    const validatedBorrowDuration = (parseInt(localBorrowDuration) || 0) <= 0 ? '1' : localBorrowDuration;
    
    // Update local state if they were invalid
    if (validatedFineRate !== localFineRate) setLocalFineRate(validatedFineRate);
    if (validatedMaxBorrow !== localMaxBorrow) setLocalMaxBorrow(validatedMaxBorrow);
    if (validatedBorrowDuration !== localBorrowDuration) setLocalBorrowDuration(validatedBorrowDuration);

    try {
      await onUpdate({
        refreshRate: localRate,
        autoRefresh: String(localAuto),
        libraryName: localLibraryName,
        fineRate: validatedFineRate,
        maxBorrowLimit: validatedMaxBorrow,
        borrowDurationDays: validatedBorrowDuration
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">System Configuration</h3>
              <p className="text-sm text-slate-500">Manage global application behavior and library rules.</p>
            </div>
          </div>
          <button 
            onClick={onManualRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <RefreshCw size={16} />
            Manual Refresh
          </button>
        </div>
        
        <div className="p-8 space-y-10">
          {/* General Settings */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
              <LayoutDashboard size={18} className="text-blue-600" />
              <h4>General Settings</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Library Name</label>
                <input 
                  type="text" 
                  value={localLibraryName}
                  onChange={(e) => setLocalLibraryName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="e.g. SLMS"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Auto Refresh</h4>
                  <p className="text-[10px] text-slate-500">Automatically update data in the background.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={localAuto}
                    onChange={(e) => setLocalAuto(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </section>

          {/* Refresh Rate */}
          <section className={`space-y-6 transition-all duration-300 ${!localAuto ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
              <Clock size={18} className="text-blue-600" />
              <h4>Refresh Interval</h4>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Update frequency</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-bold text-sm">{localRate} seconds</span>
              </div>
              <input 
                type="range" 
                min="10" 
                max="300" 
                step="10"
                value={localRate}
                onChange={(e) => setLocalRate(e.target.value)}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Fast (10s)</span>
                <span>Slow (300s)</span>
              </div>
            </div>
          </section>

          {/* Library Rules */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
              <Book size={18} className="text-blue-600" />
              <h4>Library Rules & Policies</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Fine Rate (₹/day)</label>
                <input 
                  type="number" 
                  value={localFineRate}
                  onChange={(e) => setLocalFineRate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Max Borrow Limit</label>
                <input 
                  type="number" 
                  value={localMaxBorrow}
                  onChange={(e) => setLocalMaxBorrow(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Borrow Duration (days)</label>
                <input 
                  type="number" 
                  value={localBorrowDuration}
                  onChange={(e) => setLocalBorrowDuration(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>
          </section>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-slate-100">
            <div className="flex items-center gap-3 text-blue-800 bg-blue-50 px-4 py-3 rounded-xl border border-blue-100 max-w-md">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-xs leading-relaxed">
                Changes to library rules will apply to all <strong>new</strong> transactions. Existing borrowings will maintain their original due dates.
              </p>
            </div>
            <button 
              onClick={handleSave}
              disabled={isUpdating}
              className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {isUpdating ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              Save All Changes
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
            <Lock size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Security Settings</h3>
            <p className="text-xs text-slate-500">Update your administrative credentials.</p>
          </div>
        </div>
        <ChangePassword />
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, color }: { icon: React.ReactNode, title: string, value: string, color: string }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function HelpSection() {
  const faqs = [
    {
      q: "How do I add a new book to the library?",
      a: "As an admin, go to the Dashboard tab, click the 'Add Book' button in the Manage Books section, and fill in the details."
    },
    {
      q: "How do I manage member accounts?",
      a: "In the Manage Members section of the Dashboard, you can add new members, edit existing ones, or delete accounts. You can also monitor membership expiry dates."
    },
    {
      q: "What does the Demand Forecast do?",
      a: "The Demand Forecast uses historical borrowing data to predict future library usage using an ARIMA model, helping you plan book acquisitions."
    },
    {
      q: "How do I export library data?",
      a: "Click the 'Export All Data (CSV)' button at the top right of the dashboard to download books, members, and borrowing history in CSV format."
    },
    {
      q: "How do I handle overdue books?",
      a: "The system automatically calculates fines (₹10/day). You can see overdue status in the dashboard summary and member list."
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-8 flex items-center gap-3">
        <HelpCircle className="text-blue-600" size={28} />
        Administrator Help & FAQ
      </h2>
      <div className="space-y-6">
        {faqs.map((faq, idx) => (
          <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <h4 className="font-bold text-slate-900 mb-2 flex items-start gap-2">
              <span className="text-blue-600 font-mono">Q:</span>
              {faq.q}
            </h4>
            <p className="text-slate-600 text-sm leading-relaxed pl-6">
              <span className="text-emerald-600 font-mono font-bold mr-2">A:</span>
              {faq.a}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-12 p-6 bg-blue-50 rounded-xl border border-blue-100">
        <h3 className="font-bold text-blue-900 mb-2">Need Technical Support?</h3>
        <p className="text-blue-800 text-sm">If you encounter any system errors or need advanced database management, please contact the IT department or the system administrator.</p>
      </div>
    </div>
  );
}

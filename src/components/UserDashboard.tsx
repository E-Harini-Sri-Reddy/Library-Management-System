import React, { useState, useEffect } from 'react';
import { 
  Book, 
  Clock, 
  AlertCircle, 
  Search, 
  Bell, 
  ArrowRight,
  Filter,
  LayoutDashboard,
  Settings,
  Lock,
  Loader2,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Star,
  Plus,
  History
} from 'lucide-react';
import { ChangePassword } from './ChangePassword';
import { useAuth } from '../contexts/AuthContext';
import { LibraryService } from '../services/LibraryService';

export default function UserDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'help'>('dashboard');
  const [borrowedBooks, setBorrowedBooks] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [borrowingHistory, setBorrowingHistory] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState<'all' | 'title' | 'author' | 'category'>('all');
  const [borrowedSearchQuery, setBorrowedSearchQuery] = useState('');
  const [borrowingId, setBorrowingId] = useState<number | null>(null);
  const [returningId, setReturningId] = useState<number | null>(null);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [reservingId, setReservingId] = useState<number | null>(null);
  const [confirmReturnId, setConfirmReturnId] = useState<number | null>(null);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [bookReviews, setBookReviews] = useState<any[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [globalSettings, setGlobalSettings] = useState({ 
    refreshRate: '60', 
    autoRefresh: 'true',
    libraryName: 'SLMS',
    fineRate: '10',
    maxBorrowLimit: '5',
    borrowDurationDays: '14'
  });

  const calculateFine = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    if (today <= due) return 0;
    const diffTime = Math.abs(today.getTime() - due.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays * (parseInt(globalSettings.fineRate) || 10);
  };

  const getOverdueDays = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    if (today <= due) return 0;
    const diffTime = Math.abs(today.getTime() - due.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (globalSettings.autoRefresh === 'true') {
      const rate = parseInt(globalSettings.refreshRate) || 60;
      const interval = setInterval(fetchData, rate * 1000);
      return () => clearInterval(interval);
    }
  }, [globalSettings]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [borrowingsData, reservationsData, booksData, notificationsData, historyData, popularData, settingsData] = await Promise.all([
        LibraryService.getMyBorrowings(),
        LibraryService.getMyReservations(),
        LibraryService.getBooks(),
        LibraryService.getNotifications(),
        LibraryService.getMyBorrowingHistory(),
        LibraryService.getPopularBooks(),
        LibraryService.getSettings()
      ]);
      setBorrowedBooks(borrowingsData);
      setReservations(reservationsData);
      setAllBooks(booksData);
      setNotifications(notificationsData);
      setBorrowingHistory(historyData);
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
      
      // Refined Recommendation Algorithm
      const categoryFrequencies: Record<string, number> = {};
      historyData.forEach((b: any) => {
        const cats = b.category.split(',').map((c: string) => c.trim());
        cats.forEach(cat => {
          categoryFrequencies[cat] = (categoryFrequencies[cat] || 0) + 1;
        });
      });

      const borrowedBookIds = new Set(historyData.map((b: any) => b.bookId));
      
      const recs = booksData
        .filter((b: any) => !borrowedBookIds.has(b.id))
        .map((b: any) => {
          const bookCats = b.category.split(',').map((c: string) => c.trim());
          
          // Calculate category score based on frequency
          let categoryScore = 0;
          bookCats.forEach(cat => {
            categoryScore += (categoryFrequencies[cat] || 0) * 5; // Weight frequency
          });

          const popularity = popularData.find((p: any) => p.id === b.id)?.borrowCount || 0;
          
          // Final score: combination of category preference and overall popularity
          // Popular books in preferred genres get the highest score
          let score = (popularity * 2) + categoryScore;
          
          return { ...b, score };
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
        
      setRecommendations(recs);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBorrow = async (bookId: number) => {
    setBorrowingId(bookId);
    try {
      const res = await LibraryService.borrowBook(bookId);
      if (res.success) {
        showToast('Book borrowed successfully!', 'success');
        fetchData();
      } else {
        showToast(res.error || 'Failed to borrow book', 'error');
      }
    } catch (error) {
      console.error('Borrowing failed:', error);
    } finally {
      setBorrowingId(null);
    }
  };

  const handleReturn = async (borrowingId: number) => {
    setReturningId(borrowingId);
    try {
      const res = await LibraryService.returnBook(borrowingId);
      if (res.success) {
        showToast('Book returned successfully!', 'success');
        fetchData();
        setConfirmReturnId(null);
      } else {
        showToast(res.error || 'Failed to return book', 'error');
      }
    } catch (error) {
      console.error('Return failed:', error);
    } finally {
      setReturningId(null);
    }
  };

  const handleRenew = async (borrowingId: number) => {
    setRenewingId(borrowingId);
    try {
      const res = await LibraryService.renewBook(borrowingId);
      if (res.success) {
        showToast('Book renewed successfully!', 'success');
        fetchData();
      } else {
        showToast(res.error || 'Failed to renew book', 'error');
      }
    } catch (error) {
      console.error('Renewal failed:', error);
    } finally {
      setRenewingId(null);
    }
  };

  const handleReserve = async (bookId: number) => {
    setReservingId(bookId);
    try {
      const res = await LibraryService.reserveBook(bookId);
      if (res.success) {
        showToast('Book reserved successfully! You will be notified when it is available.', 'success');
        fetchData();
      } else {
        showToast(res.error || 'Failed to reserve book', 'error');
      }
    } catch (error) {
      console.error('Reservation failed:', error);
    } finally {
      setReservingId(null);
    }
  };

  const totalFines = borrowedBooks.reduce((acc, book) => acc + calculateFine(book.dueDate), 0);

  const getMembershipExpiryDays = () => {
    if (!user?.membershipExpiry) return null;
    const expiryDate = new Date(user.membershipExpiry);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const expiryDays = getMembershipExpiryDays();

  const handleMarkAllRead = async () => {
    try {
      await LibraryService.markNotificationsAsRead();
      fetchData();
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  const handleViewBookDetails = async (book: any) => {
    setSelectedBook(book);
    try {
      const reviews = await LibraryService.getBookReviews(book.id);
      setBookReviews(reviews);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    
    setSubmittingReview(true);
    try {
      const res = await LibraryService.submitReview({
        bookId: selectedBook.id,
        rating: reviewRating,
        comment: reviewComment
      });
      
      if (res.success) {
        showToast('Review submitted successfully!', 'success');
        setShowReviewModal(false);
        setReviewComment('');
        setReviewRating(5);
        // Refresh reviews if modal is still open for this book
        const updatedReviews = await LibraryService.getBookReviews(selectedBook.id);
        setBookReviews(updatedReviews);
        fetchData();
      } else {
        showToast(res.error || 'Failed to submit review', 'error');
      }
    } catch (error) {
      console.error('Review submission failed:', error);
    } finally {
      setSubmittingReview(false);
    }
  };

  const filteredBooks = allBooks.filter(b => {
    const query = searchQuery.toLowerCase();
    if (searchField === 'title') return b.title.toLowerCase().includes(query);
    if (searchField === 'author') return b.author.toLowerCase().includes(query);
    if (searchField === 'category') return b.category.toLowerCase().includes(query);
    return (
      b.title.toLowerCase().includes(query) ||
      b.author.toLowerCase().includes(query) ||
      b.category.toLowerCase().includes(query)
    );
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

      {/* Return Confirmation Modal */}
      {confirmReturnId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold text-slate-800">Confirm Return</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to return <span className="font-bold text-slate-900">"{borrowedBooks.find(b => b.id === confirmReturnId)?.title}"</span>? 
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmReturnId(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleReturn(confirmReturnId)}
                disabled={returningId === confirmReturnId}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                {returningId === confirmReturnId && <Loader2 size={16} className="animate-spin" />}
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Details Modal */}
      {selectedBook && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row relative">
            <button 
              onClick={() => setSelectedBook(null)} 
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 z-10 bg-white/80 rounded-full p-1"
            >
              <CheckCircle2 className="rotate-45" size={24} />
            </button>
            
            {/* Book Cover & Info */}
            <div className="md:w-1/3 bg-slate-50 p-8 flex flex-col items-center border-r border-slate-100">
              {selectedBook.coverUrl ? (
                <img 
                  src={selectedBook.coverUrl} 
                  alt={selectedBook.title} 
                  className="w-full max-w-[200px] aspect-[2/3] object-cover rounded-lg shadow-lg mb-6" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full max-w-[200px] aspect-[2/3] bg-slate-200 rounded-lg shadow-inner mb-6 flex items-center justify-center text-slate-400">
                  <Book size={64} />
                </div>
              )}
              <h3 className="text-xl font-bold text-slate-900 text-center mb-1">{selectedBook.title}</h3>
              <p className="text-slate-500 text-center mb-4">{selectedBook.author}</p>
              
              <div className="flex items-center gap-1 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    size={20} 
                    className={star <= Math.round(selectedBook.avgRating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'} 
                  />
                ))}
                <span className="ml-2 text-sm font-bold text-slate-700">
                  {selectedBook.avgRating ? selectedBook.avgRating.toFixed(1) : 'No ratings'}
                </span>
              </div>

              <div className="w-full space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Category</span>
                  <span className="font-medium text-slate-800">{selectedBook.category}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Availability</span>
                  <span className={`font-medium ${selectedBook.availableQuantity > 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {selectedBook.availableQuantity} / {selectedBook.totalQuantity}
                  </span>
                </div>

                {selectedBook.availableQuantity === 0 && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                      <Clock size={16} />
                      Reservation Queue
                    </div>
                    {reservations.find(r => r.bookId === selectedBook.id) ? (
                      <p className="text-xs text-blue-600">
                        Your position: <span className="font-bold">#{reservations.find(r => r.bookId === selectedBook.id).queuePosition}</span> in line
                      </p>
                    ) : (
                      <p className="text-xs text-blue-600">
                        Current queue: <span className="font-bold">{selectedBook.reservationCount || 0}</span> people waiting
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button 
                onClick={() => selectedBook.availableQuantity > 0 ? handleBorrow(selectedBook.id) : handleReserve(selectedBook.id)}
                disabled={user?.membership === 'Inactive' || borrowingId === selectedBook.id || reservingId === selectedBook.id || reservations.some(r => r.bookId === selectedBook.id)}
                className={`w-full mt-8 py-3 rounded-xl font-bold transition-all shadow-md ${
                  user?.membership === 'Inactive'
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : reservations.some(r => r.bookId === selectedBook.id)
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      : selectedBook.availableQuantity > 0 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {user?.membership === 'Inactive' 
                  ? 'Account Inactive' 
                  : reservations.some(r => r.bookId === selectedBook.id) 
                    ? 'Already Reserved' 
                    : (selectedBook.availableQuantity > 0 ? 'Borrow Now' : 'Reserve Now')}
              </button>
            </div>

            {/* Reviews Section */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-bold text-slate-800">Reader Reviews ({bookReviews.length})</h4>
                <div className="flex items-center gap-3">
                  {borrowingHistory.some(h => h.bookId === selectedBook.id && h.status === 'Returned') ? (
                    <button 
                      onClick={() => setShowReviewModal(true)}
                      className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus size={16} /> Write a Review
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100 italic">
                      Return this book to leave a review
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {bookReviews.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <HelpCircle size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500">No reviews yet. Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  bookReviews.map((review) => (
                    <div key={review.id} className="border-b border-slate-100 pb-6 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs">
                            {(review.displayName || review.username)[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{review.displayName || review.username}</p>
                            <p className="text-[10px] text-slate-400">{new Date(review.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                              key={star} 
                              size={12} 
                              className={star <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'} 
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed italic">"{review.comment}"</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Submission Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowReviewModal(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
              <CheckCircle2 className="rotate-45" size={20} />
            </button>
            <h3 className="text-lg font-bold text-slate-800 mb-6">Write a Review</h3>
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star 
                        size={32} 
                        className={star <= reviewRating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'} 
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Your Thoughts</label>
                <textarea 
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  required
                  placeholder="What did you think of this book?"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                />
              </div>
              <button 
                type="submit" 
                disabled={submittingReview}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingReview && <Loader2 size={18} className="animate-spin" />}
                Submit Review
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Inactive Account Warning */}
      {user?.membership === 'Inactive' && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg flex items-start gap-3 shadow-sm">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-red-800 font-bold">Account Inactive</h3>
            <p className="text-red-700 text-sm">Your membership is currently inactive. You will not be able to borrow, reserve, or renew books until your account is activated by the administrator.</p>
          </div>
        </div>
      )}

      {/* Membership Expiry Warning Banner */}
      {expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg flex items-start justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-start gap-3">
            <Clock className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-amber-800 font-bold">Membership Expiring Soon</h3>
              <p className="text-amber-700 text-sm">Your library membership will expire in <span className="font-bold">{expiryDays} day{expiryDays === 1 ? '' : 's'}</span> ({new Date(user!.membershipExpiry!).toLocaleDateString()}). Please visit the library to renew your membership and avoid any disruption in service.</p>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold border border-amber-200">
              Action Required
            </div>
          </div>
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
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* Overdue Alert Banner */}
          {borrowedBooks.some(b => new Date(b.dueDate) < new Date()) && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3">
                <AlertCircle className="text-red-600" size={24} />
                <div>
                  <h4 className="text-red-800 font-bold">Immediate Action Required!</h4>
                  <p className="text-red-700 text-sm">You have overdue books. Please return them immediately to avoid further fines.</p>
                </div>
              </div>
              <button 
                onClick={() => document.getElementById('borrowed-books-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"
              >
                View Overdue Books
              </button>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard icon={<Book size={24} />} title="Borrowed Books" value={borrowedBooks.length.toString()} color="bg-blue-50 text-blue-600" />
            <StatCard icon={<Clock size={24} />} title="Due Items" value={borrowedBooks.filter(b => new Date(b.dueDate) < new Date()).length.toString()} color="bg-orange-50 text-orange-600" />
            <StatCard icon={<AlertCircle size={24} />} title="Pending Fines" value={`₹${totalFines.toFixed(2)}`} color="bg-red-50 text-red-600" />
            <StatCard icon={<History size={24} />} title="Past Borrowings" value={borrowingHistory.filter(h => h.status === 'Returned').length.toString()} color="bg-purple-50 text-purple-600" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left Column: Notifications, Reservations, History Quick View */}
            <div className="xl:col-span-4 space-y-6">
              {/* Reservations */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Bell size={18} className="text-purple-600" /> My Reservations
                  </h3>
                </div>
                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                  {reservations.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No active reservations.</p>
                  ) : (
                    reservations.map((res) => (
                      <div key={res.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-sm font-semibold text-slate-900">{res.title}</p>
                        <p className="text-xs text-slate-500">{res.author}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-slate-400">Reserved: {new Date(res.reservationDate).toLocaleDateString()}</span>
                            <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1">
                              <Clock size={10} /> Position: #{res.queuePosition}
                            </span>
                          </div>
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-medium">Pending</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Notifications */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Bell size={18} className="text-blue-600" /> Notifications
                    {notifications.filter(n => !n.isRead).length > 0 && (
                      <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {notifications.filter(n => !n.isRead).length}
                      </span>
                    )}
                  </h3>
                  <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">Mark all as read</button>
                </div>
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                  {expiryDays !== null && expiryDays <= 7 && expiryDays > 0 && (
                    <NotificationItem 
                      message={`Your membership expires in ${expiryDays} days. Please renew soon.`}
                      time="Membership"
                      type="due"
                    />
                  )}

                  {notifications.length === 0 && borrowedBooks.length === 0 && expiryDays === null && (
                    <p className="text-sm text-slate-500 text-center py-4">No new notifications.</p>
                  )}
                  
                  {notifications.map(notif => (
                    <NotificationItem 
                      key={notif.id}
                      message={notif.message} 
                      time={new Date(notif.date).toLocaleString()} 
                      type={(notif.message.includes('available') || notif.message.includes('borrowed') ? 'success' : (notif.isRead ? 'info' : 'fine')) as NotificationItemProps['type']} 
                      isRead={notif.isRead}
                      onClick={() => {
                        if (notif.link === 'borrowed') {
                          document.getElementById('borrowed-books-section')?.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                    />
                  ))}

                  {borrowedBooks.map(book => {
                    const dueDate = new Date(book.dueDate);
                    const today = new Date();
                    const diffTime = dueDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays < 0) {
                      return (
                        <div key={`overdue-${book.id}`}>
                          <NotificationItem 
                            message={`OVERDUE: "${book.title}" was due on ${dueDate.toLocaleDateString()}. Please return it immediately.`}
                            time="Urgent"
                            type="fine"
                          />
                        </div>
                      );
                    } else if (diffDays <= 3) {
                      return (
                        <div key={`due-${book.id}`}>
                          <NotificationItem 
                            message={`Reminder: "${book.title}" is due in ${diffDays} day${diffDays === 1 ? '' : 's'}.`}
                            time="Soon"
                            type="due"
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>

              {/* Borrowing History Quick View */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <History size={18} className="text-purple-600" /> Recent History
                  </h3>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {borrowingHistory.filter(h => h.status === 'Returned').length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No past borrowings.</p>
                  ) : (
                    borrowingHistory
                      .filter(h => h.status === 'Returned')
                      .reduce((acc: any[], current: any) => {
                        if (!acc.find(item => item.bookId === current.bookId)) {
                          acc.push(current);
                        }
                        return acc;
                      }, [])
                      .slice(0, 5)
                      .map((history) => (
                        <div key={history.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-purple-200 transition-colors group cursor-pointer" onClick={() => handleViewBookDetails(allBooks.find(b => b.id === history.bookId))}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-10 bg-slate-200 rounded overflow-hidden shrink-0">
                              {allBooks.find(b => b.id === history.bookId)?.coverUrl && (
                                <img src={allBooks.find(b => b.id === history.bookId).coverUrl} alt={history.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-purple-600 transition-colors">{history.title}</p>
                              <p className="text-[10px] text-slate-500 truncate">{new Date(history.borrowDate).toLocaleDateString()}</p>
                            </div>
                            <ArrowRight size={14} className="text-slate-300 group-hover:text-purple-500 transition-colors" />
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Borrowed Books, Browse Books */}
            <div className="xl:col-span-8 space-y-6">
              {/* My Borrowed Books */}
              <div id="borrowed-books-section" className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="font-semibold text-slate-800">My Borrowed Books</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search my books..." 
                      value={borrowedSearchQuery}
                      onChange={(e) => setBorrowedSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3 font-medium">Title</th>
                        <th className="px-6 py-3 font-medium">Due Date</th>
                        <th className="px-6 py-3 font-medium">Fines</th>
                        <th className="px-6 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {borrowedBooks.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500">You haven't borrowed any books yet.</td>
                        </tr>
                      ) : (
                        borrowedBooks
                          .filter(b => 
                            b.title.toLowerCase().includes(borrowedSearchQuery.toLowerCase()) ||
                            b.author.toLowerCase().includes(borrowedSearchQuery.toLowerCase())
                          )
                          .map((book) => (
                            <tr key={book.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-900">{book.title}</span>
                                <span className="text-xs text-slate-500">{book.author}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                new Date(book.dueDate) < new Date() ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                              }`}>
                                {new Date(book.dueDate).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className={`font-medium ${calculateFine(book.dueDate) > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                  ₹{calculateFine(book.dueDate).toFixed(2)}
                                </span>
                                {calculateFine(book.dueDate) > 0 && (
                                  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                                    {getOverdueDays(book.dueDate)} days overdue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <button 
                                  onClick={() => handleRenew(book.id)}
                                  disabled={user?.membership === 'Inactive' || renewingId === book.id || new Date(book.dueDate) < new Date()}
                                  className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={user?.membership === 'Inactive' ? "Account inactive" : (new Date(book.dueDate) < new Date() ? "Cannot renew overdue book" : "Renew book")}
                                >
                                  {renewingId === book.id ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                                  Renew
                                </button>
                                <button 
                                  onClick={() => setConfirmReturnId(book.id)}
                                  disabled={returningId === book.id}
                                  className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1 disabled:opacity-50"
                                >
                                  {returningId === book.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                  Return
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Browse Books */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h3 className="font-semibold text-slate-800">Browse Library Collection</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                      <Filter size={14} className="text-slate-400" />
                      <select 
                        value={searchField}
                        onChange={(e) => setSearchField(e.target.value as any)}
                        className="text-xs bg-transparent outline-none focus:ring-0 text-slate-600"
                      >
                        <option value="all">All Fields</option>
                        <option value="title">Title</option>
                        <option value="author">Author</option>
                        <option value="category">Category</option>
                      </select>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text" 
                        placeholder={`Search...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredBooks.map((book) => (
                    <div key={book.id} onClick={() => handleViewBookDetails(book)} className="flex gap-4 p-3 hover:bg-slate-50 rounded-xl transition-all border border-slate-100 hover:border-blue-200 cursor-pointer group bg-white">
                      <div className="w-20 h-28 bg-slate-100 rounded-lg overflow-hidden shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                        {book.coverUrl ? (
                          <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Book size={24} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">{book.title}</p>
                          <p className="text-xs text-slate-500 mb-1 truncate">{book.author}</p>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star 
                                  key={star} 
                                  size={10} 
                                  className={star <= Math.round(book.avgRating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'} 
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">{book.avgRating ? book.avgRating.toFixed(1) : 'N/A'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {book.category.split(',').slice(0, 2).map((cat: string, idx: number) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
                                {cat.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-[10px] text-slate-400 font-medium">
                            {book.availableQuantity} of {book.totalQuantity} available
                          </p>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (user?.membership === 'Inactive') return;
                              const isReserved = reservations.some(r => r.bookId === book.id);
                              if (isReserved) return;
                              book.availableQuantity > 0 ? handleBorrow(book.id) : handleReserve(book.id)
                            }}
                            disabled={user?.membership === 'Inactive' || borrowingId === book.id || reservingId === book.id || reservations.some(r => r.bookId === book.id)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-all shadow-sm ${
                              user?.membership === 'Inactive'
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : reservations.some(r => r.bookId === book.id)
                                  ? 'bg-purple-50 text-purple-600 cursor-not-allowed border border-purple-100'
                                  : book.availableQuantity > 0 
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            } disabled:opacity-50`}
                          >
                            {(borrowingId === book.id || reservingId === book.id) ? <Loader2 size={12} className="animate-spin" /> : null}
                            {user?.membership === 'Inactive' ? 'Inactive' : (reservations.some(r => r.bookId === book.id) ? 'Reserved' : (book.availableQuantity > 0 ? 'Borrow' : 'Reserve'))}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations Section */}
          {recommendations.length > 0 && (
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 rounded-2xl shadow-2xl p-8 text-white mb-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -ml-32 -mb-32"></div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/20 backdrop-blur-md rounded-xl border border-white/10">
                    <TrendingUp size={28} className="text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight">Personalized Recommendations</h3>
                    <p className="text-blue-200/70 text-sm font-medium">AI-curated selection based on your reading patterns</p>
                  </div>
                </div>
                <div className="mt-4 sm:mt-0 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-xs font-bold tracking-widest uppercase text-blue-200">
                  Top Picks
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 relative z-10">
                {recommendations.map((book) => (
                  <div 
                    key={book.id} 
                    onClick={() => handleViewBookDetails(book)} 
                    className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group cursor-pointer flex flex-col h-full shadow-lg hover:shadow-blue-500/10"
                  >
                    <div className="aspect-[2/3] bg-slate-800 rounded-xl mb-4 flex items-center justify-center group-hover:scale-[1.02] transition-transform overflow-hidden shadow-2xl ring-1 ring-white/10">
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                          <Book size={40} className="opacity-20" />
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">No Cover</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col">
                      <h4 className="text-sm font-bold text-white line-clamp-2 group-hover:text-blue-300 transition-colors mb-1 leading-tight">{book.title}</h4>
                      <p className="text-xs text-blue-200/60 truncate mb-3">{book.author}</p>
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-0.5">
                            <Star size={12} className="text-yellow-400 fill-yellow-400" />
                          </div>
                          <span className="text-xs font-bold text-white">{book.avgRating ? book.avgRating.toFixed(1) : 'New'}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-md border border-blue-500/20 uppercase tracking-wider">
                          {book.category.split(',')[0]}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Borrowing History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Borrowing History & Reviews</h3>
              <p className="text-xs text-slate-500">Rate and review books you've returned</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 font-medium">Book</th>
                    <th className="px-6 py-3 font-medium">Borrowed</th>
                    <th className="px-6 py-3 font-medium">Returned</th>
                    <th className="px-6 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {borrowingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No borrowing history found.</td>
                    </tr>
                  ) : (
                    borrowingHistory
                      .filter(h => h.status === 'Returned')
                      .map((history) => (
                        <tr key={history.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-12 bg-slate-100 rounded overflow-hidden shrink-0">
                                {allBooks.find(b => b.id === history.bookId)?.coverUrl ? (
                                  <img src={allBooks.find(b => b.id === history.bookId).coverUrl} alt={history.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <Book size={12} />
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{history.title}</p>
                                <p className="text-xs text-slate-500">{history.author}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{new Date(history.borrowDate).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{new Date(history.returnDate).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => handleViewBookDetails(allBooks.find(b => b.id === history.bookId))}
                              className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100 transition-colors"
                            >
                              Rate & Review
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'help' ? (
        <HelpSection />
      ) : (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col items-center text-center gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
                <Settings size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Account Settings</h3>
                <p className="text-sm text-slate-500">Manage your profile and security preferences.</p>
              </div>
            </div>
            <div className="p-8 space-y-10">
              <section className="space-y-6">
                <div className="flex flex-col items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                  <Lock size={18} className="text-blue-600" />
                  <h4>Security</h4>
                </div>
                <ChangePassword />
              </section>

              <section className="space-y-6">
                <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2">
                  <Bell size={18} className="text-blue-600" />
                  <h4>Preferences</h4>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-slate-800 text-sm">Email Notifications</h5>
                      <p className="text-xs text-slate-500">Receive alerts about due dates and reservations.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
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
      q: "How do I borrow a book?",
      a: "Browse the 'Browse Books' section, find a book you like, and click the 'Borrow' button. If the book is available, it will be added to your 'My Borrowed Books' list."
    },
    {
      q: "What if a book is not available?",
      a: "If a book's available quantity is 0, the 'Borrow' button will change to 'Reserve'. Click it to join the waiting list. You'll receive a notification when the book is returned."
    },
    {
      q: "How do I return a book?",
      a: "In the 'My Borrowed Books' table, click the 'Return' button next to the book you wish to return."
    },
    {
      q: "Can I renew a book?",
      a: "Yes! You can click 'Renew' to extend your due date by 14 days, as long as the book is not already overdue."
    },
    {
      q: "What are the overdue fines?",
      a: "Fines are calculated at ₹10 per day for each day a book is kept past its due date."
    },
    {
      q: "How do I change my password?",
      a: "Go to the 'Settings' tab to update your account password."
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-8 flex items-center gap-3">
        <HelpCircle className="text-blue-600" size={28} />
        Library Member Help & FAQ
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
        <h3 className="font-bold text-blue-900 mb-2">Need More Help?</h3>
        <p className="text-blue-800 text-sm">If you have questions not covered here, please visit the library front desk or contact the librarian at support@library.com.</p>
      </div>
    </div>
  );
}

interface NotificationItemProps {
  message: string;
  time: string;
  type: 'due' | 'fine' | 'info' | 'success';
  isRead?: boolean;
  onClick?: () => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ message, time, type, isRead, onClick }) => {
  const colors = {
    due: 'bg-orange-500',
    fine: 'bg-red-500',
    info: 'bg-blue-500',
    success: 'bg-emerald-500'
  };

  return (
    <div 
      onClick={onClick}
      className={`flex gap-3 p-3 rounded-lg border transition-all ${onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-md' : ''} ${isRead ? 'bg-slate-50 border-slate-100 opacity-75' : 'bg-white border-blue-100 shadow-sm ring-1 ring-blue-50'}`}
    >
      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colors[type] || colors.info} ${!isRead ? 'animate-pulse ring-4 ring-opacity-20' : ''}`} style={{ ringColor: colors[type] }} />
      <div className="flex-1">
        <p className={`text-xs leading-relaxed ${isRead ? 'text-slate-600' : 'text-slate-900 font-semibold'}`}>{message}</p>
        <p className="text-[10px] text-slate-400 mt-1 uppercase font-semibold tracking-wider">{time}</p>
      </div>
      {!isRead && (
        <div className="w-2 h-2 bg-blue-600 rounded-full self-center" title="Unread" />
      )}
    </div>
  );
};

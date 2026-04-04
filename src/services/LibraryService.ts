const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const LibraryService = {
  async handleResponse(res: Response) {
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.error || `Request failed with status ${res.status}`);
      } catch {
        throw new Error(`Request failed with status ${res.status}: ${text.substring(0, 100)}...`);
      }
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return res.json();
    }
    const text = await res.text();
    throw new Error(`Expected JSON response but got ${contentType || 'unknown'}: ${text.substring(0, 100)}...`);
  },

  // Books
  async getBooks() {
    const res = await fetch('/api/books');
    return this.handleResponse(res);
  },

  async addBook(book: { title: string, author: string, category: string, totalQuantity?: number, coverUrl?: string }) {
    const res = await fetch('/api/admin/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(book)
    });
    return this.handleResponse(res);
  },

  async updateBook(id: number, book: { title: string, author: string, category: string, status: string, totalQuantity?: number, coverUrl?: string }) {
    const res = await fetch(`/api/admin/books/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(book)
    });
    return this.handleResponse(res);
  },

  async deleteBook(id: number) {
    const res = await fetch(`/api/admin/books/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return this.handleResponse(res);
  },

  // Users
  async getUsers() {
    const res = await fetch('/api/admin/users', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async addUser(user: any) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(user)
    });
    return this.handleResponse(res);
  },

  async updateUser(id: number, user: any) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(user)
    });
    return this.handleResponse(res);
  },

  async deleteUser(id: number) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return this.handleResponse(res);
  },

  async checkMembershipStatus() {
    const res = await fetch('/api/admin/check-membership-status', {
      method: 'POST',
      headers: getAuthHeader()
    });
    return this.handleResponse(res);
  },

  // Borrowing
  async getMyBorrowings() {
    const res = await fetch('/api/user/borrowings', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async getMyBorrowingHistory() {
    const res = await fetch('/api/user/borrowing-history', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async getPopularBooks() {
    const res = await fetch('/api/public/popular-books');
    return this.handleResponse(res);
  },

  async getMyReservations() {
    const res = await fetch('/api/user/reservations', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async borrowBook(bookId: number) {
    const res = await fetch('/api/user/borrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ bookId })
    });
    return this.handleResponse(res);
  },

  async returnBook(borrowingId: number) {
    const res = await fetch('/api/user/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ borrowingId })
    });
    return this.handleResponse(res);
  },

  async renewBook(borrowingId: number) {
    const res = await fetch('/api/user/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ borrowingId })
    });
    return this.handleResponse(res);
  },

  async reserveBook(bookId: number) {
    const res = await fetch('/api/user/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ bookId })
    });
    return this.handleResponse(res);
  },

  async getBorrowingHistory() {
    const res = await fetch('/api/admin/stats/borrowing-history', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async getAllBorrowings() {
    const res = await fetch('/api/admin/borrowings', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async getDemandForecast() {
    const res = await fetch('/api/admin/demand-forecast', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  // Forecasting
  async getForecast(data: number[], steps: number = 5) {
    const res = await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ data, steps })
    });
    return this.handleResponse(res);
  },

  // Notifications
  async getNotifications() {
    const res = await fetch('/api/user/notifications', { headers: getAuthHeader() });
    return this.handleResponse(res);
  },

  async markNotificationsAsRead() {
    const res = await fetch('/api/user/notifications/read', {
      method: 'POST',
      headers: getAuthHeader()
    });
    return this.handleResponse(res);
  },

  // Reviews
  async getBookReviews(bookId: number) {
    const res = await fetch(`/api/books/${bookId}/reviews`);
    return this.handleResponse(res);
  },

  async submitReview(review: { bookId: number, rating: number, comment: string }) {
    const res = await fetch('/api/user/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(review)
    });
    return this.handleResponse(res);
  },

  // Settings
  async getSettings() {
    const res = await fetch('/api/settings');
    return this.handleResponse(res);
  },

  async updateSettings(settings: Record<string, any>) {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ settings })
    });
    return this.handleResponse(res);
  }
};

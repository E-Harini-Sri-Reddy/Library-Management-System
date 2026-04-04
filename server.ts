import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

async function sendResetEmail(email: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const resetLink = `${appUrl}?token=${token}`;

  if (!process.env.SMTP_HOST) {
    console.log(`[SIMULATED EMAIL] To: ${email}\nSubject: Password Reset\nLink: ${resetLink}`);
    return true;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Library System" <noreply@example.com>',
    to: email,
    subject: 'Password Reset Request',
    text: `You requested a password reset. Click the following link to reset your password: ${resetLink}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #1e293b;">Password Reset Request</h2>
        <p style="color: #475569;">You requested a password reset for your library account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">This is an automated message, please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

async function startServer() {
  console.log('Starting server initialization...');
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Initialize SQLite Database
  console.log('Initializing database...');
  let db: Database.Database;
  try {
    const dbPath = process.env.DATABASE_PATH || 'library.db';
    db = new Database(dbPath);
    console.log(`Database connected successfully at ${dbPath}.`);
  } catch (err) {
    console.error('Failed to connect to database:', err);
    throw err;
  }
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      displayName TEXT,
      membership TEXT DEFAULT 'Active',
      joinDate TEXT,
      membershipExpiry TEXT,
      resetToken TEXT,
      resetTokenExpiry TEXT
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      author TEXT,
      category TEXT,
      totalQuantity INTEGER DEFAULT 1,
      availableQuantity INTEGER DEFAULT 1,
      status TEXT DEFAULT 'Available',
      coverUrl TEXT
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      bookId INTEGER,
      rating INTEGER,
      comment TEXT,
      createdAt TEXT,
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(bookId) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS borrowings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      bookId INTEGER,
      borrowDate TEXT,
      dueDate TEXT,
      returnDate TEXT,
      status TEXT DEFAULT 'Issued',
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(bookId) REFERENCES books(id)
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      bookId INTEGER,
      reservationDate TEXT,
      status TEXT DEFAULT 'Pending',
      FOREIGN KEY(userId) REFERENCES users(id),
      FOREIGN KEY(bookId) REFERENCES books(id)
    );
  `);

  // Migration: Add quantity columns to books if they don't exist
  const tableInfo = db.prepare("PRAGMA table_info(books)").all() as any[];
  const hasTotalQuantity = tableInfo.some(col => col.name === 'totalQuantity');
  if (!hasTotalQuantity) {
    console.log('Migrating books table: adding quantity columns...');
    try {
      db.exec("ALTER TABLE books ADD COLUMN totalQuantity INTEGER DEFAULT 1");
      db.exec("ALTER TABLE books ADD COLUMN availableQuantity INTEGER DEFAULT 1");
      // Update availableQuantity based on current status for existing books
      db.exec("UPDATE books SET totalQuantity = 1, availableQuantity = CASE WHEN status = 'Available' THEN 1 ELSE 0 END");
      console.log('Migration successful.');
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }

  // Migration: Add joinDate column to users if it doesn't exist
  const userInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
  const hasJoinDate = userInfo.some(col => col.name === 'joinDate');
  if (!hasJoinDate) {
    console.log('Migrating users table: adding joinDate column...');
    try {
      db.exec("ALTER TABLE users ADD COLUMN joinDate TEXT");
      // Set a default join date for existing users
      db.exec("UPDATE users SET joinDate = date('now') WHERE joinDate IS NULL");
      console.log('Migration successful.');
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }

  // Migration: Add coverUrl column to books if it doesn't exist
  const hasCoverUrl = tableInfo.some(col => col.name === 'coverUrl');
  if (!hasCoverUrl) {
    console.log('Migrating books table: adding coverUrl column...');
    try {
      db.exec("ALTER TABLE books ADD COLUMN coverUrl TEXT");
      console.log('Migration successful.');
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }

  // Migration: Add membershipExpiry column to users if it doesn't exist
  const hasMembershipExpiry = userInfo.some(col => col.name === 'membershipExpiry');
  if (!hasMembershipExpiry) {
    console.log('Migrating users table: adding membershipExpiry column...');
    try {
      db.exec("ALTER TABLE users ADD COLUMN membershipExpiry TEXT");
      // Set a default expiry date for existing users (1 year from now)
      db.exec("UPDATE users SET membershipExpiry = date('now', '+1 year') WHERE membershipExpiry IS NULL OR membershipExpiry = ''");
      console.log('Migration successful.');
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }

  // Migration: Add resetToken columns to users if they don't exist
  const hasResetToken = userInfo.some(col => col.name === 'resetToken');
  if (!hasResetToken) {
    console.log('Migrating users table: adding resetToken columns...');
    try {
      db.exec("ALTER TABLE users ADD COLUMN resetToken TEXT");
      db.exec("ALTER TABLE users ADD COLUMN resetTokenExpiry TEXT");
      console.log('Migration successful.');
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }

  // Create notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      message TEXT,
      date TEXT,
      isRead INTEGER DEFAULT 0,
      link TEXT,
      FOREIGN KEY(userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('refreshRate', '60');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('autoRefresh', 'true');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('libraryName', 'SLMS');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('fineRate', '10');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('maxBorrowLimit', '5');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('borrowDurationDays', '14');
  `);

  // Helper to check and update membership status
  const checkMembershipStatus = () => {
    try {
      // Past expiry -> Inactive (except if Suspended)
      // We use date() to ensure consistent comparison format (YYYY-MM-DD)
      // If membershipExpiry is missing or invalid, we treat it as expired for safety
      const expireResult = db.prepare(`
        UPDATE users 
        SET membership = 'Inactive' 
        WHERE (membershipExpiry IS NULL OR membershipExpiry = '' OR date(membershipExpiry) < date('now'))
        AND membership != 'Suspended' 
        AND membership != 'Inactive'
        AND username != 'admin'
      `).run();
      
      if (expireResult.changes > 0) {
        console.log(`Updated ${expireResult.changes} users to Inactive due to expiry.`);
      }

      // Future expiry -> Active (if currently Inactive)
      const reactivateResult = db.prepare(`
        UPDATE users 
        SET membership = 'Active' 
        WHERE date(membershipExpiry) >= date('now') 
        AND membership = 'Inactive'
      `).run();

      if (reactivateResult.changes > 0) {
        console.log(`Reactivated ${reactivateResult.changes} users to Active.`);
      }

      // Always ensure admin is Active
      db.prepare("UPDATE users SET membership = 'Active', role = 'admin', membershipExpiry = '9999-12-31' WHERE username = 'admin'").run();
    } catch (err) {
      console.error('Error in checkMembershipStatus:', err);
    }
  };

  // Helper to create default data if not exists
  const seedData = () => {
    // Admin
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!admin) {
      const hashedPassword = bcrypt.hashSync('admin', 10);
      const joinDate = new Date().toISOString().split('T')[0];
      const expiryDate = '9999-12-31';
      db.prepare('INSERT INTO users (username, email, password, role, displayName, joinDate, membershipExpiry, membership) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run('admin', 'admin@library.com', hashedPassword, 'admin', 'Administrator', joinDate, expiryDate, 'Active');
    } else {
      // Ensure existing admin is always active and has admin role
      db.prepare('UPDATE users SET role = ?, membership = ?, membershipExpiry = ? WHERE username = ?')
        .run('admin', 'Active', '9999-12-31', 'admin');
    }

    // Initial Users
    const initialUsers = [
      { username: 'emily', email: 'emily@example.com', displayName: 'Emily Davis', role: 'user' },
      { username: 'mark', email: 'mark@example.com', displayName: 'Mark Taylor', role: 'user' },
      { username: 'sarah', email: 'sarah@example.com', displayName: 'Sarah Lee', role: 'user', membership: 'Inactive' }
    ];

    initialUsers.forEach(u => {
      const exists = db.prepare('SELECT * FROM users WHERE username = ?').get(u.username);
      if (!exists) {
        const hashedPassword = bcrypt.hashSync(u.username, 10); // Password is first name (username)
        db.prepare('INSERT INTO users (username, email, password, role, displayName, membership) VALUES (?, ?, ?, ?, ?, ?)')
          .run(u.username, u.email, hashedPassword, u.role, u.displayName, u.membership || 'Active');
      }
    });

    // Initial Books
    const initialBooks = [
      { title: 'Clean Code', author: 'Robert C. Martin', category: 'Technology', totalQuantity: 5 },
      { title: 'Digital Fortress', author: 'Dan Brown', category: 'Mystery', totalQuantity: 3 },
      { title: 'Biology Basics', author: 'Jane Collins', category: 'Science', totalQuantity: 2 },
      { title: 'Sapiens', author: 'Yuval Noah Harari', category: 'History', totalQuantity: 4 },
      { title: 'The Silent Patient', author: 'Alex Michaelides', category: 'Thriller', totalQuantity: 3 }
    ];

    initialBooks.forEach(b => {
      const exists = db.prepare('SELECT * FROM books WHERE title = ?').get(b.title);
      if (!exists) {
        db.prepare('INSERT INTO books (title, author, category, totalQuantity, availableQuantity) VALUES (?, ?, ?, ?, ?)')
          .run(b.title, b.author, b.category, b.totalQuantity, b.totalQuantity);
      }
    });

    // Seed historical borrowings for ARIMA (last 12 months)
    const borrowingCount = db.prepare('SELECT COUNT(*) as count FROM borrowings').get() as any;
    if (borrowingCount.count < 50) { // Seed if we don't have enough data
      console.log('Seeding historical borrowing data for forecasting...');
      const months = 12;
      const baseBorrowings = [12, 15, 10, 18, 22, 25, 20, 24, 28, 30, 26, 22]; // Mock counts for last 12 months
      
      for (let i = 0; i < months; i++) {
        const date = new Date('2026-03-25T10:00:00Z');
        date.setMonth(date.getMonth() - (months - i));
        const count = baseBorrowings[i] || 15;
        
        for (let j = 0; j < count; j++) {
          const user = db.prepare('SELECT id FROM users LIMIT 1 OFFSET ?').get(Math.floor(Math.random() * 3)) as any;
          const book = db.prepare('SELECT id FROM books LIMIT 1 OFFSET ?').get(Math.floor(Math.random() * 5)) as any;
          
          if (user && book) {
            const borrowDate = date.toISOString();
            const dueDate = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
            db.prepare('INSERT INTO borrowings (userId, bookId, borrowDate, dueDate, status) VALUES (?, ?, ?, ?, ?)')
              .run(user.id, book.id, borrowDate, dueDate, 'Returned');
          }
        }
      }
    }
  };
  seedData();

  // Helper to fulfill reservations when a book becomes available
  const fulfillReservations = (bookId: number) => {
    try {
      const book: any = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
      if (!book || book.availableQuantity <= 0) return;

      const pendingReservations = db.prepare('SELECT * FROM reservations WHERE bookId = ? AND status = ? ORDER BY reservationDate ASC')
        .all(bookId, 'Pending') as any[];

      const settings = db.prepare('SELECT * FROM settings').all() as any[];
      const settingsObj = settings.reduce((acc: any, s: any) => {
        acc[s.key] = s.value;
        return acc;
      }, {});
      const borrowDurationDays = parseInt(settingsObj.borrowDurationDays) || 14;

      for (const resv of pendingReservations) {
        if (book.availableQuantity <= 0) break;

        const resvUser: any = db.prepare('SELECT membership FROM users WHERE id = ?').get(resv.userId);
        if (resvUser && resvUser.membership === 'Active') {
          // Assign to this user
          const bDate = new Date().toISOString();
          const dueDateObj = new Date(Date.now() + borrowDurationDays * 24 * 60 * 60 * 1000);
          const dDate = dueDateObj.toISOString();
          const formattedDueDate = dueDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          
          db.prepare('INSERT INTO borrowings (userId, bookId, borrowDate, dueDate) VALUES (?, ?, ?, ?)')
            .run(resv.userId, bookId, bDate, dDate);
          
          db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run('Fulfilled', resv.id);
          
          // Update book availability
          book.availableQuantity -= 1;
          const newStatus = book.availableQuantity > 0 ? 'Available' : 'Borrowed';
          db.prepare('UPDATE books SET availableQuantity = ?, status = ? WHERE id = ?')
            .run(book.availableQuantity, newStatus, bookId);
          
          const msg = `The book "${book.title}" you reserved has been automatically borrowed for you! It's due on ${formattedDueDate}. Click here to view it in your borrowed books.`;
          db.prepare('INSERT INTO notifications (userId, message, date, link) VALUES (?, ?, ?, ?)')
            .run(resv.userId, msg, new Date().toISOString(), 'borrowed');
        } else if (resvUser) {
          // Notify inactive user they missed out
          const msg = `The book "${book.title}" you reserved became available, but your account is inactive. Please contact the administrator.`;
          db.prepare('INSERT INTO notifications (userId, message, date) VALUES (?, ?, ?)')
            .run(resv.userId, msg, new Date().toISOString());
          
          // We don't fulfill it, but we might want to skip them or keep them in queue.
          // For now, we keep them in queue but they don't get the book.
        }
      }
    } catch (err) {
      console.error('Error in fulfillReservations:', err);
    }
  };

  // API Routes
  app.post('/api/signup', (req, res) => {
    const { username, email, password, displayName } = req.body;
    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const joinDate = new Date().toISOString().split('T')[0];
      const membershipExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const result = db.prepare('INSERT INTO users (username, email, password, role, displayName, joinDate, membershipExpiry) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(username, email, hashedPassword, 'user', displayName, joinDate, membershipExpiry);
      
      const token = jwt.sign({ id: result.lastInsertRowid, role: 'user' }, JWT_SECRET);
      res.json({ token, user: { id: result.lastInsertRowid, username, email, role: 'user', displayName } });
    } catch (err: any) {
      res.status(400).json({ error: 'Username or email already exists' });
    }
  });

  // User Management (Admin)
  app.post('/api/admin/check-membership-status', (req, res) => {
    try {
      checkMembershipStatus();
      res.json({ success: true, message: 'Membership statuses updated successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/users', (req, res) => {
    checkMembershipStatus();
    const users = db.prepare('SELECT id, username, email, role, displayName, membership, joinDate, membershipExpiry FROM users').all();
    res.json(users);
  });

  app.post('/api/admin/users', (req, res) => {
    const { username, email, password, role, displayName, membership, joinDate, membershipExpiry } = req.body;
    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const jDate = joinDate || new Date().toISOString().split('T')[0];
      const mExpiry = membershipExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const result = db.prepare('INSERT INTO users (username, email, password, role, displayName, membership, joinDate, membershipExpiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(username, email, hashedPassword, role, displayName, membership, jDate, mExpiry);
      
      // Check status immediately after adding
      checkMembershipStatus();
      
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/admin/users/:id', (req, res) => {
    const { id } = req.params;
    let { username, email, role, displayName, membership, joinDate, membershipExpiry } = req.body;
    try {
      const existingUser: any = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      if (existingUser && existingUser.username === 'admin') {
        // Protect admin role and membership
        role = 'admin';
        membership = 'Active';
        // Optionally prevent username change too
        username = 'admin';
      }

      db.prepare('UPDATE users SET username = ?, email = ?, role = ?, displayName = ?, membership = ?, joinDate = ?, membershipExpiry = ? WHERE id = ?')
        .run(username, email, role, displayName, membership, joinDate, membershipExpiry, id);
      
      // Check status immediately after updating
      checkMembershipStatus();
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    const { id } = req.params;
    try {
      const user: any = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      if (user && user.username === 'admin') {
        return res.status(400).json({ error: 'Default admin account cannot be deleted.' });
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Book Management
  app.get('/api/books', (req, res) => {
    const books = db.prepare(`
      SELECT b.*, 
             (SELECT AVG(rating) FROM reviews WHERE bookId = b.id) as avgRating,
             (SELECT COUNT(*) FROM reviews WHERE bookId = b.id) as reviewCount,
             (SELECT COUNT(*) FROM reservations WHERE bookId = b.id AND status = 'Pending') as reservationCount
      FROM books b
    `).all();
    res.json(books);
  });

  app.post('/api/admin/books', (req, res) => {
    const { title, author, category, totalQuantity, coverUrl } = req.body;
    const qty = parseInt(totalQuantity) || 1;
    const result = db.prepare('INSERT INTO books (title, author, category, totalQuantity, availableQuantity, coverUrl) VALUES (?, ?, ?, ?, ?, ?)')
      .run(title, author, category, qty, qty, coverUrl);
    
    // Check if there are reservations for this new book (unlikely but possible if seeded)
    fulfillReservations(result.lastInsertRowid as number);
    
    res.json({ id: result.lastInsertRowid });
  });

  app.put('/api/admin/books/:id', (req, res) => {
    const { id } = req.params;
    const { title, author, category, status, totalQuantity, coverUrl } = req.body;
    
    db.transaction(() => {
      const book: any = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
      if (!book) return res.status(404).json({ error: 'Book not found' });

      const newTotal = parseInt(totalQuantity) || book.totalQuantity;
      const diff = newTotal - book.totalQuantity;
      const newAvailable = Math.max(0, book.availableQuantity + diff);
      const newStatus = newAvailable > 0 ? 'Available' : 'Borrowed';

      db.prepare('UPDATE books SET title = ?, author = ?, category = ?, status = ?, totalQuantity = ?, availableQuantity = ?, coverUrl = ? WHERE id = ?')
        .run(title, author, category, newStatus, newTotal, newAvailable, coverUrl, id);
      
      // If we added copies, fulfill reservations
      if (diff > 0) {
        fulfillReservations(parseInt(id));
      }
    })();
    
    res.json({ success: true });
  });

  app.delete('/api/admin/books/:id', (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM books WHERE id = ?').run(id);
    res.json({ success: true });
  });

  app.get('/api/books/:id/reviews', (req, res) => {
    const { id } = req.params;
    const reviews = db.prepare(`
      SELECT r.*, u.displayName, u.username
      FROM reviews r
      JOIN users u ON r.userId = u.id
      WHERE r.bookId = ?
      ORDER BY r.createdAt DESC
    `).all(id);
    res.json(reviews);
  });

  app.post('/api/user/reviews', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { bookId, rating, comment } = req.body;
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      
      // Check if user has returned the book at least once
      const hasBorrowed = db.prepare('SELECT * FROM borrowings WHERE userId = ? AND bookId = ? AND status = ?').get(decoded.id, bookId, 'Returned');
      if (!hasBorrowed) {
        return res.status(400).json({ error: 'You can only review books you have borrowed and returned' });
      }

      const createdAt = new Date().toISOString();
      db.prepare('INSERT INTO reviews (userId, bookId, rating, comment, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(decoded.id, bookId, rating, comment, createdAt);
      
      res.json({ success: true });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Stats for ARIMA
  app.get('/api/admin/stats/borrowing-history', (req, res) => {
    // Get borrowings grouped by month for the last 12 months
    const history = db.prepare(`
      SELECT 
        strftime('%Y-%m', borrowDate) as month,
        COUNT(*) as count
      FROM borrowings
      WHERE borrowDate >= date('now', '-12 months')
      GROUP BY month
      ORDER BY month ASC
    `).all();
    
    res.json(history);
  });

  app.get('/api/user/borrowing-history', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const borrowings = db.prepare(`
        SELECT b.*, bk.title, bk.author, bk.category
        FROM borrowings b
        JOIN books bk ON b.bookId = bk.id
        WHERE b.userId = ?
        ORDER BY b.borrowDate DESC
      `).all(decoded.id);
      res.json(borrowings);
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.get('/api/public/popular-books', (req, res) => {
    const popular = db.prepare(`
      SELECT bk.*, COUNT(b.id) as borrowCount
      FROM books bk
      LEFT JOIN borrowings b ON bk.id = b.bookId
      GROUP BY bk.id
      ORDER BY borrowCount DESC
      LIMIT 10
    `).all();
    res.json(popular);
  });

  app.get('/api/admin/borrowings', (req, res) => {
    const borrowings = db.prepare(`
      SELECT b.*, u.username, u.email, bk.title, bk.author
      FROM borrowings b
      JOIN users u ON b.userId = u.id
      JOIN books bk ON b.bookId = bk.id
    `).all();
    res.json(borrowings);
  });

  // Borrowing
  app.get('/api/user/borrowings', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const borrowings = db.prepare(`
        SELECT b.*, bk.title, bk.author 
        FROM borrowings b 
        JOIN books bk ON b.bookId = bk.id 
        WHERE b.userId = ? AND b.status != 'Returned'
      `).all(decoded.id);
      res.json(borrowings);
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/user/borrow', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { bookId } = req.body;
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      
      // Fetch settings
      const settings = db.prepare('SELECT * FROM settings').all() as any[];
      const settingsObj = settings.reduce((acc: any, s: any) => {
        acc[s.key] = s.value;
        return acc;
      }, {});
      const maxBorrowLimit = parseInt(settingsObj.maxBorrowLimit) || 5;
      const borrowDurationDays = parseInt(settingsObj.borrowDurationDays) || 14;

      const user: any = db.prepare('SELECT membership FROM users WHERE id = ?').get(decoded.id);
      
      if (!user || user.membership !== 'Active') {
        return res.status(403).json({ error: 'Your account is inactive. Please contact the administrator to borrow books.' });
      }

      // Check borrow limit
      const currentBorrowings = db.prepare('SELECT COUNT(*) as count FROM borrowings WHERE userId = ? AND status != ?').get(decoded.id, 'Returned') as any;
      if (currentBorrowings.count >= maxBorrowLimit) {
        return res.status(400).json({ error: `You have reached your maximum borrowing limit of ${maxBorrowLimit} books.` });
      }

      const book: any = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
      
      if (!book || book.availableQuantity <= 0) {
        return res.status(400).json({ error: 'No copies available for this book' });
      }

      const borrowDate = new Date().toISOString();
      const dueDate = new Date(Date.now() + borrowDurationDays * 24 * 60 * 60 * 1000).toISOString();

      db.transaction(() => {
        db.prepare('INSERT INTO borrowings (userId, bookId, borrowDate, dueDate) VALUES (?, ?, ?, ?)')
          .run(decoded.id, bookId, borrowDate, dueDate);
        
        const newAvailable = book.availableQuantity - 1;
        const newStatus = newAvailable > 0 ? 'Available' : 'Borrowed';
        db.prepare('UPDATE books SET availableQuantity = ?, status = ? WHERE id = ?')
          .run(newAvailable, newStatus, bookId);
      })();

      res.json({ success: true });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/user/return', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { borrowingId } = req.body;
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const borrowing: any = db.prepare('SELECT * FROM borrowings WHERE id = ? AND userId = ?').get(borrowingId, decoded.id);
      
      if (!borrowing) return res.status(404).json({ error: 'Borrowing record not found' });
      if (borrowing.status === 'Returned') return res.status(400).json({ error: 'Book already returned' });

      const returnDate = new Date().toISOString();

      db.transaction(() => {
        db.prepare('UPDATE borrowings SET returnDate = ?, status = ? WHERE id = ?').run(returnDate, 'Returned', borrowingId);
        
        const book: any = db.prepare('SELECT * FROM books WHERE id = ?').get(borrowing.bookId);
        
        // Update available quantity first
        const newAvailable = book.availableQuantity + 1;
        db.prepare('UPDATE books SET availableQuantity = ?, status = ? WHERE id = ?')
          .run(newAvailable, 'Available', borrowing.bookId);
        
        // Then try to fulfill reservations
        fulfillReservations(borrowing.bookId);
      })();

      res.json({ success: true });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/user/renew', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { borrowingId } = req.body;
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const borrowing: any = db.prepare('SELECT * FROM borrowings WHERE id = ? AND userId = ?').get(borrowingId, decoded.id);
      
      if (!borrowing) return res.status(404).json({ error: 'Borrowing record not found' });
      if (borrowing.status === 'Returned') return res.status(400).json({ error: 'Cannot renew a returned book' });
      
      const now = new Date();
      const dueDate = new Date(borrowing.dueDate);
      if (now > dueDate) {
        return res.status(400).json({ error: 'Cannot renew an overdue book' });
      }

      // Check if any other user is waiting (pending reservations)
      const reservation: any = db.prepare('SELECT * FROM reservations WHERE bookId = ? AND status = ?').get(borrowing.bookId, 'Pending');
      if (reservation) {
        return res.status(400).json({ error: 'Cannot renew: another user is waiting for this book' });
      }

      // Fetch settings
      const settings = db.prepare('SELECT * FROM settings').all() as any[];
      const settingsObj = settings.reduce((acc: any, s: any) => {
        acc[s.key] = s.value;
        return acc;
      }, {});
      const borrowDurationDays = parseInt(settingsObj.borrowDurationDays) || 14;

      const newDueDate = new Date(dueDate.getTime() + borrowDurationDays * 24 * 60 * 60 * 1000).toISOString();

      db.prepare('UPDATE borrowings SET dueDate = ? WHERE id = ?').run(newDueDate, borrowingId);

      res.json({ success: true, newDueDate });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/user/reserve', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { bookId } = req.body;
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const user: any = db.prepare('SELECT membership FROM users WHERE id = ?').get(decoded.id);
      
      if (!user || user.membership !== 'Active') {
        return res.status(403).json({ error: 'Your account is inactive. Please contact the administrator to reserve books.' });
      }
      
      // Check if already reserved by this user
      const existing: any = db.prepare('SELECT * FROM reservations WHERE userId = ? AND bookId = ? AND status = ?').get(decoded.id, bookId, 'Pending');
      if (existing) return res.status(400).json({ error: 'You already have a pending reservation for this book' });

      const reservationDate = new Date().toISOString();
      db.prepare('INSERT INTO reservations (userId, bookId, reservationDate) VALUES (?, ?, ?)')
        .run(decoded.id, bookId, reservationDate);

      res.json({ success: true });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.get('/api/user/reservations', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const reservations = db.prepare(`
        SELECT r.*, bk.title, bk.author,
               (SELECT COUNT(*) FROM reservations WHERE bookId = r.bookId AND status = 'Pending' AND id <= r.id) as queuePosition
        FROM reservations r 
        JOIN books bk ON r.bookId = bk.id 
        WHERE r.userId = ? AND r.status = 'Pending'
      `).all(decoded.id);
      res.json(reservations);
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.get('/api/user/notifications', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const notifications = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY date DESC').all(decoded.id);
      res.json(notifications);
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/user/notifications/read', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ?').run(decoded.id);
      res.json({ success: true });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // ARIMA Forecasting
  app.post('/api/forecast', async (req, res) => {
    const { data, steps = 5 } = req.body; // data is an array of numbers (e.g., borrowings per month)
    console.log('Forecast request received with data:', data);
    
    if (!Array.isArray(data) || data.length < 3) {
      console.log('Insufficient data for forecasting');
      return res.status(400).json({ error: 'Insufficient data for forecasting (min 3 points)' });
    }

    // Ensure data contains only numbers and handle potential NaN/Infinity
    const sanitizedData = data.map(d => {
      const n = Number(d);
      return isFinite(n) ? n : 0;
    });

    try {
      console.log('Importing arima module...');
      const arimaModule = await import('arima');
      const ARIMA: any = arimaModule.default || arimaModule;
      
      // ARIMA usually needs more points for complex models, but we can try (1,0,0) for shorter series
      if (sanitizedData.length >= 8) {
        console.log('Training ARIMA model...');
        try {
          const arima = new ARIMA({ p: 1, d: 1, q: 1, verbose: false }).train(sanitizedData);
          console.log('Predicting next steps...');
          const [pred, conf] = arima.predict(steps);
          console.log('Forecast generated successfully:', pred);
          return res.json({ 
            forecast: pred.map((v: number) => Math.max(0, v)), 
            confidence: conf 
          });
        } catch (arimaErr) {
          console.warn('ARIMA training failed, falling back to trend:', arimaErr);
          throw new Error('ARIMA_FAILED');
        }
      } else {
        throw new Error('SERIES_TOO_SHORT');
      }
    } catch (err: any) {
      // Fallback for short series or ARIMA failure: Weighted Moving Average + Trend
      console.log('Using fallback trend forecasting...');
      const lastValue = sanitizedData[sanitizedData.length - 1];
      const firstValue = sanitizedData[0];
      
      // Calculate average growth rate
      let avgGrowth = 0;
      if (sanitizedData.length > 1) {
        avgGrowth = (lastValue - firstValue) / (sanitizedData.length - 1);
      }
      
      // Add some weight to the most recent trend
      const recentTrend = sanitizedData.length > 2 
        ? (sanitizedData[sanitizedData.length - 1] - sanitizedData[sanitizedData.length - 2])
        : avgGrowth;
      
      const combinedTrend = (avgGrowth * 0.4) + (recentTrend * 0.6);
      
      const pred = [];
      for (let i = 1; i <= steps; i++) {
        // Apply trend but dampen it over time to avoid runaway predictions
        const dampenedTrend = combinedTrend * Math.pow(0.9, i - 1);
        pred.push(Math.max(0, lastValue + (dampenedTrend * i)));
      }
      
      return res.json({ 
        forecast: pred, 
        confidence: Array(steps).fill([0, 0]), 
        warning: err.message === 'SERIES_TOO_SHORT' ? 'Series too short for ARIMA' : 'Forecasting fallback used'
      });
    }
  });

  app.get('/api/admin/demand-forecast', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

      const books = db.prepare('SELECT * FROM books').all() as any[];
      const forecastResults = [];

      // Import arima module once
      const arimaModule = await import('arima');
      const ARIMA: any = arimaModule.default || arimaModule;

      for (const book of books) {
        // Get monthly borrowing history for the last 12 months
        const history = db.prepare(`
          SELECT 
            strftime('%Y-%m', borrowDate) as month,
            COUNT(*) as count
          FROM borrowings
          WHERE bookId = ? AND borrowDate >= date('now', '-12 months')
          GROUP BY month
          ORDER BY month ASC
        `).all(book.id) as any[];

        // Fill in missing months with 0
        const data = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthStr = d.toISOString().slice(0, 7);
          const monthData = history.find(h => h.month === monthStr);
          data.push(monthData ? monthData.count : 0);
        }

        let predictedDemand = 0;
        let method = 'none';

        if (data.some(d => d > 0)) {
          if (data.length >= 8) {
            try {
              const arima = new ARIMA({ p: 1, d: 1, q: 1, verbose: false }).train(data);
              const [pred] = arima.predict(1);
              predictedDemand = Math.max(0, Math.round(pred[0]));
              method = 'arima';
            } catch (e) {
              // Fallback
              const lastValue = data[data.length - 1];
              const firstValue = data[0];
              const avgGrowth = (lastValue - firstValue) / (data.length - 1);
              predictedDemand = Math.max(0, Math.round(lastValue + avgGrowth));
              method = 'trend-fallback';
            }
          } else {
            const lastValue = data[data.length - 1];
            const firstValue = data[0];
            const avgGrowth = (lastValue - firstValue) / (data.length - 1);
            predictedDemand = Math.max(0, Math.round(lastValue + avgGrowth));
            method = 'trend';
          }
        }

        const currentBorrowCount = data.reduce((a, b) => a + b, 0);
        const recommendation = predictedDemand > book.totalQuantity ? 'Stock Up' : 'Sufficient';
        const stockNeeded = Math.max(0, predictedDemand - book.totalQuantity);

        forecastResults.push({
          id: book.id,
          title: book.title,
          author: book.author,
          currentStock: book.totalQuantity,
          currentBorrowCount,
          predictedDemand,
          recommendation,
          stockNeeded,
          method
        });
      }

      // Sort by predicted demand descending
      forecastResults.sort((a, b) => b.predictedDemand - a.predictedDemand);

      res.json(forecastResults);
    } catch (err) {
      console.error('Demand forecast failed:', err);
      res.status(500).json({ error: 'Failed to generate demand forecast' });
    }
  });

  app.post('/api/login', (req, res) => {
    const { emailOrUsername, password } = req.body;
    const user: any = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(emailOrUsername, emailOrUsername);
    
    if (user && bcrypt.compareSync(password, user.password)) {
      // Check membership expiry on login
      checkMembershipStatus();
      
      // Re-fetch user to get updated membership status
      const updatedUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      
      if (updatedUser.membership === 'Suspended') {
        return res.status(403).json({ 
          error: 'Your account is suspended, please contact the IT department or library front desk. Email: admin@library.com' 
        });
      }
      
      const token = jwt.sign({ id: updatedUser.id, role: updatedUser.role }, JWT_SECRET);
      res.json({ token, user: { 
        id: updatedUser.id, 
        username: updatedUser.username, 
        email: updatedUser.email, 
        role: updatedUser.role, 
        displayName: updatedUser.displayName,
        membership: updatedUser.membership,
        membershipExpiry: updatedUser.membershipExpiry
      } });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  app.get('/api/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      checkMembershipStatus();
      const user: any = db.prepare('SELECT id, username, email, role, displayName, membership, membershipExpiry FROM users WHERE id = ?').get(decoded.id);
      res.json({ user });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/change-password', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { currentPassword, newPassword } = req.body;
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      
      if (user && bcrypt.compareSync(currentPassword, user.password)) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, decoded.id);
        res.json({ message: 'Password updated' });
      } else {
        res.status(401).json({ error: 'Invalid current password' });
      }
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      // For security, don't reveal if user exists
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    db.prepare('UPDATE users SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?').run(resetToken, expiry, user.id);

    await sendResetEmail(email, resetToken);

    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  });

  app.post('/api/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    const user: any = db.prepare('SELECT * FROM users WHERE resetToken = ? AND date(resetTokenExpiry) >= date(\'now\')').get(token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ?').run(hashedPassword, user.id);

    res.json({ message: 'Password reset successful' });
  });

  // Global Settings
  app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all() as any[];
    const settingsObj = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.post('/api/admin/settings', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

      const { settings } = req.body; // { key: value }
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      db.transaction(() => {
        for (let [key, value] of Object.entries(settings)) {
          // Enforce positive values for specific keys
          if (['fineRate', 'maxBorrowLimit', 'borrowDurationDays'].includes(key)) {
            const numValue = parseInt(String(value));
            if (isNaN(numValue) || numValue <= 0) {
              value = '1';
            }
          }
          stmt.run(key, String(value));
        }
      })();
      res.json({ success: true });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Initializing Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware initialized.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Ready to handle requests.');
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

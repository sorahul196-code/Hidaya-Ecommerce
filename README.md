```
*   The frontend will be available at: `http://localhost:5173`
*   The backend API runs on: `http://localhost:4000`

## 🛡️ Security Features
*   **Database Constraints:** Use of `PRAGMA foreign_keys = ON` and explicit transaction boundaries to prevent data corruption.
*   **API Hardening:** `helmet` is implemented for secure HTTP headers.
*   **Rate Limiting:** Protects `/api/auth/` routes from brute-force and enumeration attacks.
*   **Input Validation:** `zod` schemas ensure payload integrity before database insertion.

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).

---
*Project submitted in partial fulfillmentAbsolutely. A strong, professional `README.md` is critical—especially when examiners or other developers look at your repository. Since you're replacing `whatsapp-web.js` with Nodemailer for email notifications, we'll make sure the `README` reflects this updated, lightweight architecture.

Here is a comprehensive, well-structured `README.md` file tailored specifically to your HIDAYA Jewelry project, complete with a file tree.

***

# HIDAYA Jewelry E-Commerce Platform

A full-stack, responsive e-commerce web application designed for a premium jewelry retail business. Built with a modern JavaScript stack, this platform provides a seamless shopping experience for customers and a comprehensive administrative dashboard for store management.

## 🚀 Features

### Customer Portal
*   **Secure Authentication:** User registration and login utilizing JWT sessions and bcrypt password hashing.
*   **OTP Verification:** Email-based OTP flows for registration, password recovery, and order cancellation.
*   **Product Catalog:** Browse, filter (by category, price, rating), and search for jewelry items.
*   **Shopping Cart & Wishlist:** Persistent cart and wishlist management utilizing React Context and LocalStorage.
*   **Order Placement:** Streamlined checkout process supporting Cash on Delivery (COD) and Online Payment methods.
*   **Order Management:** Customers can track their order lifecycle and download automated PDF invoices.

### Admin Dashboard
*   **Secure Access:** Two-Factor Authentication (OTP sent to admin email) required for dashboard entry.
*   **Real-time Analytics:** Aggregated metrics displaying total revenue, order counts, and daily trends.
*   **Product Management (CRUD):** Add, update, hide, or remove products from the catalog dynamically.
*   **Order Fulfillment:** Progress orders through `pending`, `processing`, `shipped`, and `completed` states.
*   **Document Generation:** Automatically generate and download PDF invoices and shipping labels with embedded QR codes using `pdf-lib`.
*   **Notification Center:** Centralized alerts for new orders, product updates, and system events.

## 🛠️ Technology Stack

*   **Frontend:** React 18, React Router DOM v6, Tailwind CSS, Framer Motion, Radix UI, Vite
*   **Backend:** Node.js, Express.js
*   **Database:** SQLite 3 (Serverless, File-based, WAL Mode)
*   **Security:** JSON Web Tokens (JWT), bcryptjs, Helmet, Express-Rate-Limit, Zod
*   **Utilities:** Nodemailer (SMTP Email dispatch), pdf-lib (PDF generation), QRCode

## 📁 Repository Structure
```text
hidaya-jewelry/
├── server/
│   ├── storage/
│   │   ├── invoices/          # Generated PDF invoices & shipping labels
│   │   └── logo.png           # Company logo for PDF generation
│   ├── db.js                  # SQLite connection and query wrappers
│   └── index.js               # Express server, API routes, and Nodemailer setup
├── src/
│   ├── components/            # Reusable UI components (Header, Footer, Modals)
│   │   ├── admin/             # Admin dashboard specific components
│   │   └── ui/                # Radix UI and base elements (Buttons, Inputs)
│   ├── context/               # React Context (Auth, Cart, Wishlist, Admin)
│   ├── data/                  # JSON product persistence fallback
│   ├── lib/                   # Utility functions and service mocks
│   ├── pages/                 # Route components (Home, Cart, Checkout, Admin)
│   ├── App.jsx                # Main application routing
│   ├── index.css              # Global styles and Tailwind directives
│   └── main.jsx               # React DOM entry point
├── .env                       # Environment variables (SMTP, Secrets)
├── .gitignore
├── package.json
├── postcss.config.js
├── schema.sql                 # Database table definitions and schema
├── tailwind.config.js
└── vite.config.js
```

## ⚙️ Local Development Setup

Follow these instructions to run the project on your local machine.

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
*   npm or yarn package manager

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/yourusername/hidaya-jewelry.git](https://github.com/yourusername/hidaya-jewelry.git)
    cd hidaya-jewelry
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory and add your configuration details:
    ```env
    PORT=4000
    JWT_SECRET=your_super_secret_jwt_key
    JWT_EXPIRES_IN=7d
    
    # Admin & Owner Emails
    VITE_ADMIN_EMAIL=admin@hidayajewelry.com
    OWNER_EMAIL=owner@hidayajewelry.com
    
    # SMTP Configuration (For OTPs & Notifications)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=your.project.email@gmail.com
    SMTP_PASS=your_16_character_app_password
    MAIL_FROM="HIDAYA Jewelry" <your.project.email@gmail.com>
    ```

4.  **Initialize the Database:**
    Run the setup script to create the `ecommerce.sqlite` file and build the tables based on `schema.sql`.
    ```bash
    npm run db:setup
    ```

### Running the Application

This project uses `concurrently` to run both the Vite frontend development server and the Node.js backend server simultaneously.

```bash
npm run dev
```
*   The frontend will be available at: `http://localhost:5173`
*   The backend API runs on: `http://localhost:4000`

## 🛡️ Security Features
*   **Database Constraints:** Use of `PRAGMA foreign_keys = ON` and explicit transaction boundaries to prevent data corruption.
*   **API Hardening:** `helmet` is implemented for secure HTTP headers.
*   **Rate Limiting:** Protects `/api/auth/` routes from brute-force and enumeration attacks.
*   **Input Validation:** `zod` schemas ensure payload integrity before database insertion.

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).

---
*Project submitted in partial fulfillment of the requirements for the degree of Bachelor of Computer Applications (B.C.A.).*
```
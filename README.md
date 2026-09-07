Medical Store Management System
A comprehensive web-based medical store management platform that digitizes medicine inventory, batch and expiry tracking, supplier and purchase management, prescription records, billing, returns, and sales reporting. The system automates stock operations, applies First-Expiry-First-Out (FEFO) inventory management, and ensures transaction-consistent medicine sales. The project demonstrates practical implementation of Object-Oriented Programming, Database Management Systems, Data Structures, Software Engineering, Web Technologies, and Principles of Programming Languages.
________________________________________
Table of Contents
•	Overview
•	Problem Statement
•	Objectives
•	Key Features
•	Technology Stack
•	Software Engineering Concepts Applied
•	System Architecture
•	Module Division
•	System Workflow
•	User Roles
•	Functional Requirements
•	Non-Functional Requirements
•	Database Design
•	Project Structure
•	Installation
•	Usage
•	Future Enhancements
•	Team Allocation
•	License
________________________________________
Overview
The Medical Store Management System is designed to simplify and automate the daily operations of a medical store by replacing manual registers and disconnected record-keeping processes with an integrated web application.
The system enables medical stores to maintain medicine information, categories, batches, expiry dates, suppliers, purchase orders, prescriptions, sales, billing records, and returns within a centralized database. It automatically manages stock quantities and selects medicine batches according to the First-Expiry-First-Out (FEFO) approach during billing.
The application also provides role-based access for Cashier, Pharmacist, Store Manager, and Admin users. It supports customer billing queues, prescription linkage, low-stock monitoring, expiry alerts, transaction-safe sales, returns processing, dashboards, and report generation.
The application follows a modular software engineering architecture where each subsystem performs an independent responsibility while collaborating with other modules to provide a reliable and maintainable medical store management solution.
________________________________________
Problem Statement
Many medical stores still depend on manual registers, spreadsheets, or disconnected systems for managing medicines, inventory, suppliers, billing, and sales records. This leads to several operational challenges:
•	Manual maintenance of medicine and stock records
•	Difficulty tracking batch-wise inventory
•	Risk of medicines approaching or passing their expiry date
•	Incorrect stock deduction during billing
•	Time-consuming manual billing processes
•	Difficulty managing suppliers and purchase orders
•	Lack of centralized prescription records
•	Errors during medicine returns and stock reversal
•	Delayed identification of low-stock medicines
•	Difficulty maintaining accurate sales and purchase records
•	Inconsistent data during simultaneous transactions
•	Limited role-based access and operational visibility
The Medical Store Management System addresses these issues by providing an automated, centralized, and transaction-consistent platform capable of managing medicine inventory, purchases, prescriptions, billing, returns, alerts, and reports through a unified system.
________________________________________
Objectives
The primary objectives of the project are:
•	Design a centralized database for storing medicines, batches, suppliers, purchases, prescriptions, sales, and returns.
•	Automate medicine inventory management and stock updates.
•	Implement FEFO-based batch selection during medicine sales.
•	Develop a secure role-based application for medical store operations.
•	Manage suppliers and purchase orders efficiently.
•	Maintain prescription records and link them with applicable sales.
•	Provide reliable and transaction-consistent billing operations.
•	Implement customer billing queue management.
•	Generate sales, stock, expiry, low-stock, purchase, and return reports.
•	Reduce manual effort and minimize billing and inventory errors.
•	Provide dashboards for monitoring important store operations.
•	Follow Software Engineering best practices throughout development.
________________________________________
Key Features
•	Secure Login & Authentication
•	Role-Based Access Control
•	Medicine Management
•	Medicine Category Management
•	Batch-Wise Inventory Management
•	Expiry Date Tracking
•	FEFO-Based Stock Deduction
•	Low-Stock Alerts
•	Expiry Alerts
•	Supplier Management
•	Purchase Order Management
•	Purchase and Batch Entry
•	Customer Billing Queue
•	Medicine Search
•	Shopping Cart / Billing Cart
•	Automatic Bill Calculation
•	Invoice Generation
•	Transaction-Safe Sales
•	Prescription Management
•	Prescription-to-Sale Linking
•	Medicine Returns
•	Stock Reversal
•	Return Reason Tracking
•	Sales Reports
•	Stock Reports
•	Purchase Reports
•	Expiry Reports
•	Low-Stock Reports
•	Interactive Dashboard
•	Search & Filtering
•	Data Validation
•	PDF Report Generation
•	Responsive Web Interface
________________________________________
Technology Stack
Programming Languages
•	Java
•	SQL
•	JavaScript
Frontend
•	HTML5
•	CSS3
•	JavaScript
Backend
•	Java
•	JDBC
Database
•	MySQL
Visualization
•	Chart.js
Development Environment
•	VS Code
•	Eclipse
Database Management
•	MySQL
•	phpMyAdmin
Version Control
•	Git
•	GitHub
________________________________________
Software Engineering Concepts Applied
The project demonstrates concepts from multiple Computer Engineering subjects.
Subject	Implementation
Object Oriented Programming	Classes, objects, encapsulation, inheritance, polymorphism, abstraction
Database Management Systems	Relational database, normalization, SQL queries, constraints, transactions
Data Structures	Queues, Lists, Arrays, HashMaps, searching and sorting
Software Engineering	SDLC, modular design, requirements analysis, testing, documentation
Web Technology	HTML, CSS, JavaScript, forms, responsive UI, client-server communication
Principles of Programming Languages	Exception handling, modular programming, abstraction, control structures
________________________________________
System Architecture
                    Users
       (Admin / Manager / Pharmacist / Cashier)
                         │
                         ▼
              Authentication Module
                         │
                         ▼
             Role-Based Access Control
                         │
                         ▼
           Medical Store Management System
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 Medicine &         Supplier &       Prescription
 Inventory          Purchase          Management
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  Billing / POS
                         │
                         ▼
                 FEFO Stock Engine
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Reports & Dashboard     Returns Processing
              │                     │
              └──────────┬──────────┘
                         ▼
                    MySQL Database
________________________________________
Module Division
Module 1: User & Authentication Management
Primarily draws from: OOP + Web Technology
Team Members: Sumit Bhamare, Vedantika Mahadik, Shreya Shivade
This module is responsible for managing user accounts and providing secure access to the system through role-based authentication. It implements separate user roles such as Admin, Store Manager, Pharmacist, and Cashier, ensuring that each user can access only the functionalities assigned to their role. The module includes user registration, secure login and logout, session/token-based authentication, password protection, and profile management. It acts as the entry point of the application and establishes a secure environment for all other modules by enforcing authentication and authorization mechanisms.
________________________________________
Module 2: Medicine & Category Management
Primarily draws from: OOP + DBMS
Team Members: Sumit Bhamare, Vedantika Mahadik, Shreya Shivade
This module manages the fundamental medicine information required by the medical store. It provides operations for adding, updating, searching, and deactivating medicines along with their categories and related information. The module maintains medicine names, descriptions, categories, pricing information, reorder levels, and other relevant attributes. Category management provides structured classification of medicines and enables efficient searching and filtering. Object-oriented classes represent medicine and category entities while the relational database ensures consistent and organized storage of records.
________________________________________
Module 3: Supplier & Purchase Management
Primarily draws from: DBMS + OOP
Team Members: Dnyaneshwari Thombal, Diksha Rupnawar, Shruti Dalvi
This module manages supplier information and the purchase process of medicines. It provides functionality for maintaining supplier records, creating purchase orders, tracking purchase information, and recording newly received medicine batches. Each purchase can contain batch-specific information such as quantity, price, manufacturing date, and expiry date. The module maintains relationships between suppliers, purchase orders, medicines, and batches using database constraints and referential integrity. Successful purchase operations automatically contribute to inventory updates and provide accurate stock information for subsequent billing operations.
________________________________________
Module 4: Billing & Point-of-Sale Management
Primarily draws from: OOP + Data Structures + DBMS
Team Members: Dnyaneshwari Thombal, Diksha Rupnawar, Shruti Dalvi
This module provides the primary point-of-sale functionality of the medical store. It allows the cashier or pharmacist to search for medicines, add them to a billing cart, validate available quantities, calculate the total amount, and generate invoices. A customer billing queue is maintained to ensure fair and ordered processing of customers. During checkout, the system verifies stock availability and selects appropriate medicine batches according to the First-Expiry-First-Out (FEFO) principle. The complete sale operation is processed as a transaction so that billing, stock deduction, and sales records are either successfully committed together or rolled back in case of failure.
________________________________________
Module 5: Stock & Expiry Tracking
Primarily draws from: Data Structures + DBMS
Team Members: Tanvi Dongare, Omkar Kulkarni, Prarthana Kumbhar
This module manages real-time medicine inventory at the batch level. It maintains quantities for individual medicine batches and tracks their expiry dates throughout the inventory lifecycle. During a sale, the system identifies the eligible batch with the earliest expiry date and deducts the required quantity using the FEFO strategy. The module also monitors reorder levels and expiry conditions to generate appropriate alerts. Data structures such as lists, queues, and maps can be used for efficient stock searching and batch selection, while database transactions maintain consistency between inventory and sales records.
________________________________________
Module 6: Prescription Management
Primarily draws from: DBMS + OOP + Web Technology
Team Members: Tanvi Dongare, Omkar Kulkarni, Prarthana Kumbhar
This module manages prescription information associated with medicine sales. It provides functionality for recording prescription details and linking prescriptions with customer transactions where required. The module maintains prescription references and their relationship with medicines and sales records. During billing, applicable medicines can be checked against the required prescription information before completing the transaction. The module uses object-oriented entities for prescription management and database relationships to ensure that prescription records remain organized, traceable, and associated with the appropriate sales transactions.
________________________________________
Module 7: Returns Processing
Primarily draws from: OOP + DBMS + Software Engineering
Team Members: Saniya Shaikh,
This module handles the return of medicines and maintains accurate inventory after a return transaction. It records return details such as the related sale, medicine, quantity, date, and reason for return. When a valid return is processed, the corresponding stock quantity is reversed according to the defined business rules. The module ensures that return records and inventory updates remain transaction-consistent so that partial updates do not leave the system in an inconsistent state. Reason-code logging also provides traceability for returned medicines and supports future reporting and analysis.
________________________________________
Module 8: Reports, Dashboard & Administration
Primarily draws from: Web Technology + Software Engineering
Team Members: Saniya Shaikh,
This module provides centralized monitoring and reporting functionality for the medical store. It generates important reports such as sales reports, stock reports, purchase reports, expiry reports, low-stock reports, and return reports. The dashboard presents key operational information through tables, charts, statistics, and performance indicators. Store managers and administrators can use these insights to monitor inventory levels, identify medicines approaching expiry, review sales activity, and make operational decisions. The module also supports report export and follows modular design principles to maintain consistency and ease of use across the application.
________________________________________
System Workflow
Admin / Pharmacist / Cashier Login
                │
                ▼
       Medicine & Inventory
          Management
                │
                ▼
       Supplier / Purchase
          Management
                │
                ▼
       Customer Billing Queue
                │
                ▼
        Medicine Selection
                │
                ▼
       Prescription Validation
                │
                ▼
        FEFO Batch Selection
                │
                ▼
       Stock Availability Check
                │
                ▼
          Billing & Invoice
                │
                ▼
       Atomic Stock Deduction
                │
                ▼
       Sales Record Generation
                │
          ┌─────┴─────┐
          ▼           ▼
      Dashboard     Reports
          │           │
          └─────┬─────┘
                ▼
           MySQL Database
________________________________________
User Roles
Admin
•	Manage Users
•	Manage Medicines
•	Manage Categories
•	Manage Suppliers
•	Manage Purchase Orders
•	Configure Store Settings
•	View Sales Reports
•	View Stock Reports
•	View Expiry and Low-Stock Alerts
•	Generate Reports
________________________________________
Store Manager
•	Manage Inventory
•	Manage Suppliers
•	Create and Monitor Purchase Orders
•	Monitor Stock Levels
•	Monitor Expiry Dates
•	View Sales Analytics
•	View Purchase Reports
•	Generate Operational Reports
•	Monitor Returns
________________________________________
Pharmacist
•	Search Medicines
•	Manage Prescriptions
•	Process Medicine Sales
•	Validate Prescription Requirements
•	View Medicine Availability
•	Process Returns
•	View Relevant Inventory Information
________________________________________
Cashier
•	Manage Customer Billing Queue
•	Search Medicines
•	Create Billing Cart
•	Generate Invoices
•	Process Sales
•	View Available Stock
•	Process Authorized Returns
________________________________________
Functional Requirements
•	User Authentication
•	Role-Based Access Control
•	User Management
•	Medicine Management
•	Category Management
•	Batch Management
•	Supplier Management
•	Purchase Order Management
•	Inventory Management
•	Expiry Tracking
•	FEFO-Based Stock Selection
•	Low-Stock Monitoring
•	Customer Queue Management
•	Billing Management
•	Invoice Generation
•	Prescription Management
•	Prescription-to-Sale Linking
•	Sales Management
•	Returns Processing
•	Stock Reversal
•	Sales Report Generation
•	Stock Report Generation
•	Purchase Report Generation
•	Expiry Report Generation
•	Dashboard Visualization
•	PDF Report Export
________________________________________
Non-Functional Requirements
•	Secure Authentication
•	Role-Based Authorization
•	High Performance
•	Scalability
•	Data Integrity
•	Transaction Consistency
•	Reliability
•	Maintainability
•	Responsive Design
•	Easy Navigation
•	Modular Architecture
•	Database Consistency
•	Accurate Stock Management
•	Fault Tolerance
•	Usability
________________________________________
Database Design
Users
•	User ID
•	Name
•	Username / Email
•	Password
•	Role
•	Status
________________________________________
Medicines
•	Medicine ID
•	Medicine Name
•	Description
•	Category ID
•	Unit Price
•	Reorder Level
•	Status
________________________________________
Categories
•	Category ID
•	Category Name
•	Description
•	Parent Category
________________________________________
Medicine Batches
•	Batch ID
•	Medicine ID
•	Batch Number
•	Manufacturing Date
•	Expiry Date
•	Purchase Price
•	Selling Price
•	Available Quantity
________________________________________
Suppliers
•	Supplier ID
•	Supplier Name
•	Contact Person
•	Phone
•	Email
•	Address
________________________________________
Purchase Orders
•	Purchase Order ID
•	Supplier ID
•	Order Date
•	Status
•	Total Amount
________________________________________
Purchase Items
•	Purchase Item ID
•	Purchase Order ID
•	Medicine ID
•	Batch ID
•	Quantity
•	Unit Price
________________________________________
Customers
•	Customer ID
•	Customer Name
•	Contact Number
•	Address
________________________________________
Prescriptions
•	Prescription ID
•	Customer ID
•	Prescription Reference
•	Prescription Date
•	Doctor Information
•	Status
________________________________________
Sales
•	Sale ID
•	Customer ID
•	User ID
•	Prescription ID
•	Sale Date
•	Total Amount
•	Payment Status
________________________________________
Sale Items
•	Sale Item ID
•	Sale ID
•	Medicine ID
•	Batch ID
•	Quantity
•	Unit Price
•	Total Price
________________________________________
Returns
•	Return ID
•	Sale ID
•	Medicine ID
•	Batch ID
•	Quantity
•	Return Reason
•	Return Date
•	Processed By
________________________________________
Business Rules
FEFO Stock Management
Medicine batches are selected according to the First-Expiry-First-Out principle. When multiple batches of the same medicine are available, the system prioritizes the eligible batch with the earliest expiry date.
Atomic Sale Transaction
A medicine sale consists of multiple related operations including stock validation, batch selection, stock deduction, invoice creation, and sales-record insertion. These operations are handled as a single database transaction so that either all required changes are committed or the complete transaction is rolled back.
Stock Validation
The system verifies the available quantity before completing a sale. A transaction cannot be completed when sufficient stock is unavailable.
Expiry Validation
Expired medicine batches must not be selected for normal sale transactions. The system identifies batches approaching expiry and provides appropriate alerts.
Low-Stock Monitoring
The system compares available stock with the configured reorder level and identifies medicines that require replenishment.
Customer Queue
Customers are processed according to their position in the billing queue to provide fair and ordered service.
Return Processing
A valid return updates the corresponding stock quantity and records the return reason and transaction details for traceability.
________________________________________
Project Structure
Medical-Store-Management-System/
│
├── backend/
│   ├── src/
│   ├── controllers/
│   ├── models/
│   ├── services/
│   └── utils/
│
├── frontend/
│   ├── html/
│   ├── css/
│   └── js/
│
├── database/
│   ├── schema/
│   ├── queries/
│   └── sample-data/
│
├── reports/
│
├── docs/
│   ├── SRS/
│   ├── UML/
│   └── design/
│
├── tests/
│
├── screenshots/
│
├── api/
│
├── README.md
│
└── LICENSE
________________________________________
Installation
git clone https://github.com/yourusername/Medical-Store-Management-System.git

cd Medical-Store-Management-System
Configure the MySQL database using the SQL scripts provided in the database directory.
Update the database connection configuration with the appropriate:
•	Database name
•	Username
•	Password
•	Host
•	Port
Install the required backend dependencies, configure the database connection, and run the application server.
________________________________________
Usage
1.	Start the backend server.
2.	Configure the MySQL database.
3.	Launch the frontend application.
4.	Login using the appropriate user role.
5.	Manage medicines and categories.
6.	Manage suppliers and purchase orders.
7.	Add and update medicine batches.
8.	Monitor stock and expiry information.
9.	Add customers to the billing queue.
10.	Search and add medicines to the billing cart.
11.	Validate prescription requirements where applicable.
12.	Process the sale using FEFO-based batch selection.
13.	Generate the invoice.
14.	Process authorized medicine returns.
15.	Monitor dashboards and alerts.
16.	Generate sales, stock, purchase, expiry, and return reports.
________________________________________
Future Enhancements
•	AI-based medicine demand forecasting
•	Machine Learning-based stock prediction
•	Intelligent reorder recommendations
•	Automated supplier recommendations
•	Barcode and QR code integration
•	Online prescription processing
•	Digital prescription verification
•	SMS and email notifications
•	Mobile application
•	Multi-store support
•	Cloud deployment
•	Real-time inventory synchronization
•	Advanced sales analytics
•	Automated expiry notifications
•	Supplier performance analytics
•	Integration with external pharmacy and healthcare systems
________________________________________
Team Allocation
Module	Team Members
User & Authentication Management	Sumit Bhamare, Vedantika Mahadik, Shreya Shivade
Medicine & Category Management	Sumit Bhamare, Vedantika Mahadik, Shreya Shivade
Supplier & Purchase Management	Dnyaneshwari Thombal, Diksha Rupnawar, Shruti Dalvi
Billing & Point-of-Sale Management	Dnyaneshwari Thombal, Diksha Rupnawar, Shruti Dalvi
Stock & Expiry Tracking	Tanvi Dongare, Omkar Kulkarni, Prarthana Kumbhar
Prescription Management	Tanvi Dongare, Omkar Kulkarni, Prarthana Kumbhar
Returns Processing	Saniya Shaikh, 
Reports, Dashboard & Administration	Saniya Shaikh,
________________________________________
License
This project is developed as part of the Engineering Design & Innovation Mini Project for academic purposes. It demonstrates the practical application of core Computer Engineering concepts, including Object-Oriented Programming, Database Management Systems, Data Structures, Software Engineering, Web Technologies, and Principles of Programming Languages, to solve real-world medical store inventory, billing, prescription, purchase, and management challenges.


# Medical Store Management System

A comprehensive web-based medical store management platform that digitizes medicine inventory, batch and expiry tracking, supplier and purchase management, prescription records, billing, returns, and sales reporting.

The system automates stock operations, applies **First-Expiry-First-Out (FEFO)** inventory management, and ensures transaction-consistent medicine sales.

The project demonstrates practical implementation of:

- **Object-Oriented Programming**
- **Database Management Systems**
- **Data Structures**
- **Software Engineering**
- **Web Technologies**
- **Principles of Programming Languages**

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Objectives](#objectives)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Software Engineering Concepts Applied](#software-engineering-concepts-applied)
- [System Architecture](#system-architecture)
- [Module Division](#module-division)
- [System Workflow](#system-workflow)
- [User Roles](#user-roles)
- [Functional Requirements](#functional-requirements)
- [Non-Functional Requirements](#non-functional-requirements)
- [Database Design](#database-design)
- [Business Rules](#business-rules)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Future Enhancements](#future-enhancements)
- [Team Allocation](#team-allocation)
- [License](#license)

---

## Overview

The **Medical Store Management System** is designed to simplify and automate the daily operations of a medical store by replacing manual registers and disconnected record-keeping processes with an integrated web application.

The system enables medical stores to maintain:

- Medicine information
- Categories
- Medicine batches
- Expiry dates
- Suppliers
- Purchase orders
- Prescriptions
- Sales
- Billing records
- Returns

All information is maintained within a centralized database.

The system automatically manages stock quantities and selects medicine batches according to the **First-Expiry-First-Out (FEFO)** approach during billing.

### User Roles

The application provides role-based access for:

- **Admin**
- **Store Manager**
- **Pharmacist**
- **Cashier**

The system supports:

- Customer billing queues
- Prescription linkage
- Low-stock monitoring
- Expiry alerts
- Transaction-safe sales
- Returns processing
- Dashboards
- Report generation

The application follows a modular software engineering architecture where each subsystem performs an independent responsibility while collaborating with other modules to provide a reliable and maintainable medical store management solution.

---

## Problem Statement

Many medical stores still depend on manual registers, spreadsheets, or disconnected systems for managing medicines, inventory, suppliers, billing, and sales records.

This leads to several operational challenges:

- Manual maintenance of medicine and stock records
- Difficulty tracking batch-wise inventory
- Risk of medicines approaching or passing their expiry date
- Incorrect stock deduction during billing
- Time-consuming manual billing processes
- Difficulty managing suppliers and purchase orders
- Lack of centralized prescription records
- Errors during medicine returns and stock reversal
- Delayed identification of low-stock medicines
- Difficulty maintaining accurate sales and purchase records
- Inconsistent data during simultaneous transactions
- Limited role-based access and operational visibility

The **Medical Store Management System** addresses these issues by providing an automated, centralized, and transaction-consistent platform capable of managing medicine inventory, purchases, prescriptions, billing, returns, alerts, and reports through a unified system.

---

## Objectives

The primary objectives of the project are:

- Design a centralized database for storing medicines, batches, suppliers, purchases, prescriptions, sales, and returns.
- Automate medicine inventory management and stock updates.
- Implement FEFO-based batch selection during medicine sales.
- Develop a secure role-based application for medical store operations.
- Manage suppliers and purchase orders efficiently.
- Maintain prescription records and link them with applicable sales.
- Provide reliable and transaction-consistent billing operations.
- Implement customer billing queue management.
- Generate sales, stock, expiry, low-stock, purchase, and return reports.
- Reduce manual effort and minimize billing and inventory errors.
- Provide dashboards for monitoring important store operations.
- Follow Software Engineering best practices throughout development.

---

## Key Features

### Authentication and Access Control

- Secure Login & Authentication
- Role-Based Access Control
- User Management
- Password Protection
- Session/Token-Based Authentication

### Medicine and Inventory

- Medicine Management
- Medicine Category Management
- Batch-Wise Inventory Management
- Expiry Date Tracking
- FEFO-Based Stock Deduction
- Low-Stock Alerts
- Expiry Alerts
- Medicine Search
- Search & Filtering

### Supplier and Purchase Management

- Supplier Management
- Purchase Order Management
- Purchase and Batch Entry
- Supplier Records
- Purchase Tracking
- Batch-Level Purchase Information

### Billing and Sales

- Customer Billing Queue
- Shopping Cart / Billing Cart
- Automatic Bill Calculation
- Invoice Generation
- Transaction-Safe Sales
- Stock Availability Validation
- FEFO-Based Batch Selection

### Prescription Management

- Prescription Management
- Prescription-to-Sale Linking
- Prescription Validation
- Prescription Reference Tracking

### Returns

- Medicine Returns
- Stock Reversal
- Return Reason Tracking
- Return Transaction Records

### Reports and Dashboard

- Sales Reports
- Stock Reports
- Purchase Reports
- Expiry Reports
- Low-Stock Reports
- Return Reports
- Interactive Dashboard
- PDF Report Generation
- Data Visualization

### Interface

- Responsive Web Interface
- Data Validation
- Search & Filtering
- Easy Navigation

---

## Technology Stack

### Programming Languages

- **Java**
- **SQL**
- **JavaScript**

### Frontend

- **HTML5**
- **CSS3**
- **JavaScript**

### Backend

- **Java**
- **JDBC**

### Database

- **MySQL**

### Visualization

- **Chart.js**

### Development Environment

- **VS Code**
- **Eclipse**

### Database Management

- **MySQL**
- **phpMyAdmin**

### Version Control

- **Git**
- **GitHub**

---

## Software Engineering Concepts Applied

The project demonstrates concepts from multiple Computer Engineering subjects.

| Subject | Implementation |
|---|---|
| **Object-Oriented Programming** | Classes, objects, encapsulation, inheritance, polymorphism, abstraction |
| **Database Management Systems** | Relational database, normalization, SQL queries, constraints, transactions |
| **Data Structures** | Queues, Lists, Arrays, HashMaps, searching and sorting |
| **Software Engineering** | SDLC, modular design, requirements analysis, testing, documentation |
| **Web Technology** | HTML, CSS, JavaScript, forms, responsive UI, client-server communication |
| **Principles of Programming Languages** | Exception handling, modular programming, abstraction, control structures |

---

## System Architecture

```text
                         USERS
          Admin / Manager / Pharmacist / Cashier
                            |
                            v
                +------------------------+
                | Authentication Module  |
                +------------------------+
                            |
                            v
                +------------------------+
                | Role-Based Access      |
                | Control                 |
                +------------------------+
                            |
                            v
             +-----------------------------+
             | Medical Store Management    |
             | System                      |
             +-----------------------------+
                            |
          +----------------+----------------+
          |                |                |
          v                v                v
   +-------------+  +-------------+  +----------------+
   | Medicine &  |  | Supplier &  |  | Prescription   |
   | Inventory   |  | Purchase    |  | Management     |
   +-------------+  +-------------+  +----------------+
          |                |                |
          +----------------+----------------+
                           |
                           v
                  +----------------+
                  | Billing / POS  |
                  +----------------+
                           |
                           v
                  +----------------+
                  | FEFO Stock     |
                  | Engine         |
                  +----------------+
                           |
                  +--------+--------+
                  |                 |
                  v                 v
          +---------------+  +------------------+
          | Reports &     |  | Returns          |
          | Dashboard     |  | Processing       |
          +---------------+  +------------------+
                  |                 |
                  +--------+--------+
                           |
                           v
                  +----------------+
                  | MySQL Database |
                  +----------------+

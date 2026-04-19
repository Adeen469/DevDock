-- DevDock Database Setup Script
-- Run this in MySQL to create the database and initial user

CREATE DATABASE IF NOT EXISTS devdock;
USE devdock;

-- Create initial admin user (password: admin123)
-- You can change this after first login
INSERT INTO Users (id, name, email, password, role, status, provider, "providerId", "createdAt", "updatedAt") 
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Admin User',
  'admin@devdock.com',
  '$2a$10$rHkN7zqCvJLXqJ5z5z5z5.5z5z5z5z5z5z5z5z5z5z5z5z5z5z5z5', -- admin123 (you should change this)
  'admin',
  'active',
  'local',
  NULL,
  NOW(),
  NOW()
);

-- Insert sample repositories for testing
INSERT INTO Repositories (id, name, description, languages, status, stars, "ownerId", "createdAt", "updatedAt") VALUES
(uuid(), 'ecommerce-api', 'RESTful backend for an e-commerce platform with cart, orders, and payments.', '["Node.js","Express","MySQL"]', 'passed', 24, NULL, NOW(), NOW()),
(uuid(), 'flight-booking-ui', 'React frontend for a flight search and booking system with seat selection.', '["React","TypeScript","TailwindCSS"]', 'partial', 18, NULL, NOW(), NOW()),
(uuid(), 'auth-service', 'JWT-based authentication microservice with OAuth2 provider support.', '["Node.js","Redis"]', 'failed', 9, NULL, NOW(), NOW());

-- Note: The actual tables will be created automatically by Sequelize when the app starts
-- This script just ensures the database exists

# EulaIQ Server

A comprehensive backend service for [EulaIQ](https://eulaiq.com) - an AI-powered educational platform that transforms PDF documents into interactive e-books with automated question generation and content analysis.

## Features

- **PDF Processing**: Convert uploaded PDFs into structured e-books with sections
- **AI Question Generation**: Create quizzes and multiple-choice questions from e-book content
- **E-Book Management**: Store, organize, and serve e-books in various formats including EPUB
- **User Authentication**: Secure JWT-based authentication system
- **Exam History**: Track and analyze user performance across quizzes
- **Content Analysis**: Extract key concepts and generate summaries from educational content

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT
- **Storage**: Azure Blob Storage
- **AI Services**: Azure OpenAI, GPT models
- **PDF Processing**: Custom OCR pipeline
- **Deployment**: Azure Web App

## Prerequisites

- Node.js v20.x
- MongoDB
- Azure account with:
  - Blob Storage
  - OpenAI service
- Environment variables configured

## Installation

1. Clone the repository
2. Install dependencies
3. Configure environment variables - Create a `.env` file
4. Start the server

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgotPassword` - Request password reset

### E-Books
- `POST /api/ebook/upload` - Upload a new PDF
- `GET /api/ebook/user` - Get user's e-books
- `GET /api/ebook/:ebookId` - Get e-book details
- `GET /api/ebook/:ebookId/sections` - Download EPUB version

### Questions & Exams
- `POST /api/question/generateQuestion` - Generate questions from e-book
- `GET /api/question` - Get questions with filtering options
- `GET /api/question/status/:examId` - Check question generation status

## Project Structure

## Deployment

The application is configured for deployment to Azure Web App using GitHub Actions. The workflow automatically builds and deploys the application when changes are pushed to the main branch.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the UNLICENSED License - see the LICENSE file for details.

© 2025 EulaIQ. All rights reserved. [eulaiq.com](https://eulaiq.com)
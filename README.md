# Secure Authentication and Authorization System on Cloudflare

A complete, secure authentication and authorization system built for Cloudflare Workers with D1 database.

## Features

- **Authentication**: User registration, login, logout with secure session management
- **Authorization**: Role-based access control (RBAC) with permissions
- **Secure Session Handling**: HttpOnly cookies with Secure and SameSite settings
- **Database Integration**: Uses Cloudflare D1 with proper migrations
- **API Protection**: Server-side authorization enforcement

## Technology Stack

- **Cloudflare Workers** - Application runtime
- **Cloudflare D1** - SQL database
- **Better Auth** - Authentication framework
- **Hono** - Web framework for routing
- **TypeScript** - Type safety
- **Wrangler** - Development and deployment tooling

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │ Cloudflare      │    │ Cloudflare D1   │
│                 │    │ Workers         │    │ Database        │
│  Browser        │───▶│  (Node.js)      │───▶│                 │
│  Mobile App     │    │  Auth Service   │    │  - Users        │
│                 │    │                 │    │  - Sessions     │
│                 │    │                 │    │  - Roles        │
└─────────────────┘    │  - Content      │    │  - Permissions  │
                       │  - Access Rules │    └─────────────────┘
                       └─────────────────┘
```

## Database Schema

### Core Tables

1. **users** - User accounts (managed by Better Auth)
2. **sessions** - Active sessions (managed by Better Auth) 
3. **accounts** - Social account connections (managed by Better Auth)
4. **roles** - User roles (admin, member, etc.)
5. **user_roles** - Many-to-many relationship between users and roles
6. **permissions** - Available permissions (read, write, manage, etc.)
7. **role_permissions** - Permissions assigned to roles
8. **content** - Content items with ownership
9. **content_access_rules** - Access control rules for content

## Routes

### Public Routes
- `/` - Landing page

### Authentication Routes
- `/api/auth/login` - Login endpoint
- `/api/auth/register` - Registration endpoint  
- `/api/auth/logout` - Logout endpoint

### Protected Routes
- `/dashboard` - User dashboard (authenticated)
- `/api/me` - Current user info
- `/api/content/list` - List accessible content
- `/api/content/:id` - Access specific content
- `/api/users/me` - Current user profile
- `/api/users/:id` - Get user info

### Admin Routes
- `/api/admin/dashboard` - Admin dashboard (admin only)
- `/api/admin/users` - Manage users (admin only)
- `/api/admin/users/:id/role` - Assign roles (admin only)
- `/api/admin/roles` - Manage roles (admin only)
- `/api/admin/permissions` - Manage permissions (admin only)

## Security Features

1. **Secure Sessions**: HttpOnly cookies with Secure and SameSite attributes
2. **CSRF Protection**: Session validation on state-changing operations
3. **Input Validation**: All inputs are validated and sanitized
4. **Authorization Enforcement**: Server-side checks for every route
5. **Role-Based Access Control**: Fine-grained permissions
6. **Content Isolation**: Users can only access content they own or have permission to view
7. **Database Security**: Parameterized queries, proper indexing

## Deployment Instructions

### Prerequisites

1. Install Wrangler: `npm install -g wrangler`
2. Create a Cloudflare account and get your API token

### Setup Steps

1. **Create D1 Database**:
   ```bash
   wrangler d1 create auth-service-db
   ```

2. **Get Database ID**:
   ```bash
   wrangler d1 list
   ```

3. **Update Wrangler Configuration**:
   Update the `database_id` in `wrangler.toml` with your actual database ID.

4. **Apply Migrations**:
   ```bash
   wrangler d1 execute auth-service-db --file ./src/database/migrations/0001_initial_schema.ts
   ```

5. **Set Secrets**:
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put SESSION_SECRET
   ```

6. **Deploy**:
   ```bash
   npm run deploy
   ```

## Development

### Local Development

```bash
npm run dev
```

### Running Tests

```bash
npm test
```

## Free Tier Limits

This implementation is designed to work within Cloudflare's free tier:

- **Compute**: 100,000 requests/day
- **D1**: 3GB storage, 100,000 read/write operations/day  
- **Workers**: 100,000 requests/day
- **Bandwidth**: 10TB/month

## Bootstrap Admin User

To create the initial administrator:

1. Deploy the application
2. Run a one-time script to create an admin user:
   ```sql
   INSERT INTO users (id, email, name) VALUES ('admin-user-id', 'admin@example.com', 'Administrator');
   INSERT INTO roles (name, description) VALUES ('admin', 'Administrator with full access');
   INSERT INTO user_roles (user_id, role_id) VALUES ('admin-user-id', 1);
   ```

## Configuration

### Environment Variables (in wrangler.toml)

- `PUBLIC_URL` - Public URL of your application
- `JWT_SECRET` - Secret for JWT tokens (set via wrangler secret)
- `SESSION_SECRET` - Secret for session encryption (set via wrangler secret)

## License

MIT License
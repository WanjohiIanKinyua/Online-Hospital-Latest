const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const demoData = {
  users: [
    {
      id: uuidv4(),
      fullName: 'John Patient',
      email: 'patient@example.com',
      password: bcrypt.hashSync('password', 10),
      phone: '+254712345678',
      role: 'patient',
      dateOfBirth: '1990-05-15',
      gender: 'male',
      address: 'Nairobi, Kenya'
    },
    {
      id: uuidv4(),
      fullName: 'Admin User',
      email: 'drnaserian@admin.com',
      password: bcrypt.hashSync('password', 10),
      phone: '+254712345679',
      role: 'admin',
      dateOfBirth: '1985-03-20',
      gender: 'male',
      address: 'Nairobi, Kenya'
    },
    {
      id: uuidv4(),
      fullName: 'Sarah Johnson',
      email: 'sarah@example.com',
      password: bcrypt.hashSync('password', 10),
      phone: '+254712345680',
      role: 'patient',
      dateOfBirth: '1992-07-22',
      gender: 'female',
      address: 'Westlands, Nairobi'
    }
  ]
};

const seed = async () => {
  console.log('Seeding demo data into PostgreSQL...\n');

  for (let index = 0; index < demoData.users.length; index += 1) {
    const user = demoData.users[index];
    try {
      await db.query(
        `
        INSERT INTO users (id, fullName, email, password, phone, role, dateOfBirth, gender, address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (email) DO NOTHING
        `,
        [
          user.id,
          user.fullName,
          user.email,
          user.password,
          user.phone,
          user.role,
          user.dateOfBirth,
          user.gender,
          user.address
        ]
      );
      console.log(`User ${index + 1} added/exists: ${user.email} (Role: ${user.role})`);
    } catch (err) {
      console.log(`Error inserting user ${index + 1}:`, err.message);
    }
  }

  console.log('\nDemo data seeding complete!');
  console.log('\nDemo Credentials:');
  console.log('--------------------------------------------------');
  console.log('Patient Account:');
  console.log('  Email: patient@example.com');
  console.log('  Password: password');
  console.log('');
  console.log('Admin Account:');
  console.log('  Email: drnaserian@admin.com');
  console.log('  Password: password');
  console.log('--------------------------------------------------');
  console.log('\nYou can now start the application!');
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});

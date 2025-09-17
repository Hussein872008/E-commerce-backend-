const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please enter a name'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters'],
    maxlength: [30, 'Name must be less than 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Please enter an email'],
    unique: true,
    lowercase: true,
    validate: {
      validator: function (val) {
  return val.includes('@');
      },
      message: 'Please enter a valid email'
    }
  },
  password: {
    type: String,
    required: [true, 'Please enter a password'],
    minlength: [8, 'Password must be at least 8 characters'],
  select: false
  },
  passwordConfirm: {
    type: String,
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords do not match!'
    }
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date
}, {
  timestamps: true
});

userSchema.add({
  roles: {
    type: [String],
    enum: ['buyer', 'seller', 'admin'],
    default: ['buyer']
  },
  activeRole: {
    type: String,
    enum: ['buyer', 'seller', 'admin'],
    default: 'buyer'
  }
});

userSchema.virtual('role')
  .get(function () {
    return this.activeRole;
  })
  .set(function (val) {
    this.activeRole = val;
    if (Array.isArray(this.roles)) {
      if (!this.roles.includes(val)) this.roles.push(val);
    } else {
      this.roles = [val];
    }
  });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

const User = mongoose.model('User', userSchema);
module.exports = User;

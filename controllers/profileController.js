const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: req.file.path }
    });

    res.json({ avatarUrl: updatedUser.avatarUrl, message: 'Avatar updated successfully' });
  } catch (error) {
    console.error('Avatar Upload Error:', error);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
};

exports.updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Current password incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  const { name, phone } = req.body;
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone }
    });

    // Also update phone in the latest loan metadata if it exists for consistency
    const latestLoan = await prisma.loan.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    if (latestLoan) {
      let metadata = latestLoan.metadata || {};
      if (typeof metadata === 'string') metadata = JSON.parse(metadata);
      if (!metadata.personalInfo) metadata.personalInfo = {};
      metadata.personalInfo.phone = phone;

      await prisma.loan.update({
        where: { id: latestLoan.id },
        data: { metadata }
      });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        loan: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const latestLoan = user.loan[0];
    const loanMetadata = latestLoan?.metadata || {};
    
    // Prefer user.phone, then fallback to loan metadata
    const displayPhone = user.phone || loanMetadata.personalInfo?.phone || '';

    res.json({
      name: user.name,
      email: user.email,
      company: user.company || latestLoan?.company || 'N/A',
      phone: displayPhone,
      avatarUrl: user.avatarUrl,
      employeeReference: loanMetadata.employmentInfo?.employeeId || `LMS-${user.id.toString().padStart(5, '0')}`,
      memberSince: user.createdAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      role: user.role.toUpperCase(),
      status: user.status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

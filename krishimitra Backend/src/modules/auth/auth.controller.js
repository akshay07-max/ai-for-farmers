// Temporary stub implementations for auth flows.
// Replace these with real logic (DB, JWT, SMS, etc.) as needed.

async function register(req, res, next) {
  try {
    return res.status(201).json({
      success: true,
      message:
        "Register endpoint is wired correctly. Implement real logic later.",
      data: {
        user: {
          name: req.body.name,
          phone: req.body.phone,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message:
        "Verify OTP endpoint is wired correctly. Implement real logic later.",
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message:
        "Login endpoint is wired correctly. Implement real auth logic later.",
      data: {
        accessToken: "dummy-access-token",
        refreshToken: "dummy-refresh-token",
      },
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message:
        "Refresh token endpoint is wired correctly. Implement real logic later.",
      data: {
        accessToken: "dummy-access-token",
      },
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message:
        "Logout endpoint is wired correctly. Implement real revoke logic later.",
    });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message:
        "Forgot password endpoint is wired correctly. Implement SMS/OTP logic later.",
    });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message:
        "Reset password endpoint is wired correctly. Implement real reset logic later.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyOtp,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};


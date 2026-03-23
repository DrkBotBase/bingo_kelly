module.exports = {
  isAuthenticated: (req, res, next) => {
    if (req.session.admin) {
      return next();
    }
    res.redirect('/admin/login');
  },
  
  isPlayer: (req, res, next) => {
    next();
  }
};
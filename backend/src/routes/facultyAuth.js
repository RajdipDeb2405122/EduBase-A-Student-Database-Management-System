const router = require('express').Router();
const { wrap } = require('../lib/common');
const { login } = require('../lib/login');
const { register } = require('../lib/registration');

router.post('/register', register('faculty'));
router.post('/login', wrap(login('faculty')));

module.exports = router;
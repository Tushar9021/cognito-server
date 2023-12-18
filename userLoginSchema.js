const mongoose = require('mongoose')
const userLoginSchema = new mongoose.Schema({
  parentEmail: String,
  childEmail:String,
  verificationToken:String,
  isCheck:Boolean,
  subId:String
})

module.exports = mongoose.model('userLoginSchema',userLoginSchema)
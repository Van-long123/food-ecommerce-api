import express from 'express'

const Router = express.Router()

Router.route('/login')
  .get((req, res) => {
    res.send('Login page')
  })

  
export const userRoute = Router
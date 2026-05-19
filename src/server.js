import express from 'express'
import cookieParser from 'cookie-parser'
import exitHook from 'async-exit-hook'
import cors from 'cors'
import { corsOptions } from './config/cors'
import { CONNECT_DB, CLOSE_DB } from '~/config/mongodb'
import { errorHandlingMiddleware } from './middlewares/errorHandlingMiddleware'
import { env } from '~/config/environment'
import { APIs_V1 } from '~/routes/v1/index'
import passport from '~/config/passport'
import { startOrderAutoCompleteJob } from '~/services/orderAutoCompleteJob'

const START_SERVER = () => {
  const app = express()

  // Fix cái vụ Cache from disk của ExpressJS
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  app.use(cookieParser())

  // Khởi tạo Passport (không dùng session vì OAuth dùng JWT/Cookie)
  app.use(passport.initialize())

  //Xử lý CORS
  app.use(cors(corsOptions))

  app.use(express.json())

  app.use('/v1', APIs_V1)

  //Middleware xử lý lỗi tập chung
  app.use(errorHandlingMiddleware)

  //Môi trường production
  if (env.BUILD_MODE === 'production') {
    // Môi trường thằng render nó tự động tạo PORT
    app.listen(process.env.PORT, () => {
      console.log(`Production: I am ${env.AUTHOR} running at PORT: ${ process.env.PORT }/`)
    })
  } else {
    //Môi trường Local Dev
    app.listen(env.APP_PORT, env.APP_NAME, () => {
      console.log(`Local Dev: I am ${env.AUTHOR} running at ${ env.APP_NAME }:${ env.APP_PORT }/`)
    })
  }

  exitHook(() => {
    console.log('Server is shutting down...')
    CLOSE_DB()
    console.log('Disconnected from MongoDB Cloud Atlas')
  })
}
// IIFE trong JavaScript: Hàm được gọi thực thi ngay lập tức
(async () => {
  try {
    await CONNECT_DB()
    console.log('Connected to MongoDB Cloud Atlas!')
    START_SERVER()
    // Khởi chạy job tự động hoàn thành đơn hàng sau khi DB kết nối thành công
    startOrderAutoCompleteJob()
  } catch (error) {
    console.error(error)
    process.exit(0)
  }
})()
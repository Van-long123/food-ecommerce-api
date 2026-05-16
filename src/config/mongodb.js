import { MongoClient, ServerApiVersion } from 'mongodb'
import { env } from '~/config/environment'
let foodDatabaseInstance = null 

// Khởi tạo một đối tượng Client mongoClientInstance đề connect tới MongoDB
const mongoClientInstance = new MongoClient(env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
})
//Kết nối tới Database
export const CONNECT_DB= async () => {
  await mongoClientInstance.connect()
  foodDatabaseInstance = mongoClientInstance.db(env.DATABASE_NAME)
}

//Đóng kết nối tới Database
export const CLOSE_DB= async () => {
  await mongoClientInstance.close()
}

export const GET_CLIENT = () => {
  return mongoClientInstance
}

export const GET_DB = () => {
  if (!foodDatabaseInstance) throw new Error('Must connect to Database first!')
  return foodDatabaseInstance
}


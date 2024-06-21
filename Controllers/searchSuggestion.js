// const { Client } = require('elasticsearch');
// const Story = require('../Models/story')
// const Exam = require('../Models/exam')

// // Elasticsearch client
// const esClient = new Client({
//     host: process.env.BONSAI_URL,
//     log: 'trace'
// });

// // Endpoint for manual index creation (call this once during setup)
// exports.createIndex = async (req, res) => {
//   try {
//     const { indexName, password } = req.body
//     if(password !== process.env.ELASTIC_CREATE_INDEX_PIN){
//         return res.status(401).json({
//             message: 'you are not allowed to do this'
//         })
//     }
//     const { body: indexExists } = await esClient.indices.exists({ index: indexName });
    
//     if (!indexExists) {
//         // Index doesn't exist, create it
//         await esClient.indices.create({ index: indexName });
//       } else {
//         return res.status(400).json({
//             message: `Index ${indexName} already exists.`
//         })
//       }

//     // Define mapping
//     await esClient.indices.putMapping({
//       index: indexName,
//       body: {
//         properties: {
//           title: { type: 'text' },
//         },
//       },
//     });

//     res.json({ success: true });
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// };


// exports.moveAllData = async(req, res) => {
//     try{
//         const allTitles = await Story.distinct("title");

//         await esClient.bulk({
//             body: allTitles.flatMap(title => [
//                 { index: { _index: 'kingsheart-blog-search-suggestion' } },
//                 { title: title },
//             ]),
//         })
//     res.status(200).json({allTitles})
//     }catch(error){
//         res.status(error?.status || 500).json({error})
//     }
// }


// exports.autoSyncElastic = async () => {
//     try {
//       // Create a Change Stream for the 'stories' collection
//       const changeStream = await Story.watch();

//       // Listen for changes in the 'stories' collection
//       changeStream.on('change', async (change) => {
//         if (change.operationType === 'insert' || change.operationType === 'update') {
//           // Fetch only the titles of the modified/inserted documents
//           const title = await Story
//           .findOne({ _id: change.documentKey._id })
//           .select({ title: 1 })
//           .lean()
//           .exec();
                    
//           // Index the titles in Elasticsearch
//           try {
//               await esClient.index({
//                 index: 'kingsheart-blog-search-suggestion',
//                 id: change.documentKey._id.toString(),
//                 body: { title: title.title },
//               });
//           } catch (e) {
//             console.error(e);
//           }
//         } else if (change.operationType === 'delete') {
//           // Delete the title from Elasticsearch
//           const docId = change.documentKey._id.toString()
//           console.log(change.documentKey._id.toString());
//           try {
//             await esClient.delete({
//               index: 'kingsheart-blog-search-suggestion',
//               id: docId,
//             });
//           } catch (e) {
//             console.error(e);
//           }
//         }
//       });

//       const examChangeSteam = await Exam.watch()
//        // Listen for changes in the 'stories' collection
//        examChangeSteam.on('change', async (change) => {
//         if (change.operationType === 'insert' || change.operationType === 'update') {
//           // Fetch only the titles of the modified/inserted documents
//           const title = await Exam
//           .findOne({ _id: change.documentKey._id })
//           .select({ name: 1, _id: 1 })
//           .lean()
//           .exec();
                    
//           // Index the titles in Elasticsearch
//           try {
//               await esClient.index({
//                 index: 'kingsheart-exam-search-suggestion',
//                 id: change.documentKey._id.toString(),
//                 body: { title: title.name, id: title._id },
//               });
//           } catch (e) {
//             console.error(e);
//           }
//         } else if (change.operationType === 'delete') {
//           // Delete the title from Elasticsearch
//           const docId = change.documentKey._id.toString()

//           try {
//             await esClient.delete({
//               index: 'kingsheart-exam-search-suggestion',
//               id: docId,
//             });
//           } catch (e) {
//             console.error(e);
//           }
//         }
//       });
//     } catch (e) {
//       console.error(e);
//     }
//   };
  


// // API endpoint for search suggestions
// exports.searchSuggestion =  async (req, res) => {
//   const query = req.query.q.toLowerCase();
//   const index = req.query.index || 'kingsheart-blog-search-suggestion'; // Use the specified index or default

//   try {
//     // Elasticsearch search query
//     const response = await esClient.search({
//       index,
//       body: {
//         query: {
//           match: {
//             title: {
//               query,
//               fuzziness: 'auto', // Enable fuzzy matching
//             },
//           },
//         },
//       },
//       size: 7,
//     });

//     const body = []
//     if(response){
//         response.hits.hits.forEach(hit => {
//             body.push(hit._source)
//         })
//         res.status(200).json({body})
//     }else{
//         res.status(201).json({})
//     }
    
//   } catch (error) {
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };



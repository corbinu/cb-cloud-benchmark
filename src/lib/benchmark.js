import fs from "fs";
import _ from "lodash";
import JSONStream from "JSONStream";
import { ViewQuery } from "couchbase";

import connect from "./connect";

export function load(num, series, dir, uri, loadProgress) {
	let bucket = connect(uri);

	bucket.operationTimeout = 7500;

	let stream = fs.createReadStream(`${dir}/generated_docs_${num}_${series}.json`, {"encoding": "utf8"});
	let parser = JSONStream.parse("owners.*");

	stream.pipe(parser);

	let owners = [];

	parser.on("data", (owner) => {
		owners.push(owner);
	});

	parser.on("end", () => {

		let chunks = _.chunk(owners, 1000);

		loadProgress.start(owners.length);

		let insertStage = Promise.resolve([]);

		_.forEach(_.range(0, chunks.length), (chunkIndex) => {

			let ownersChunk = chunks[chunkIndex];

			insertStage = insertStage.then(() => {

				return new Promise((resolve, reject) => {

					let inserts = ownersChunk.map((owner) => {

						return new Promise((resolve, reject) => {

							bucket.insert(owner.id, owner, (err) => {
								if (err && err.code !== 12) {
									console.log(err);
									return reject(err);
								}

								resolve();
							});
						});

					});

					Promise.all(inserts).then(() => {
						loadProgress.completed(chunkIndex);

						resolve();
					}, reject).catch(reject);

				});
			}, (err) => {
				console.log(err);
				throw err;
			});
		});

		insertStage.then(() => {

			loadProgress.end();

			process.exit(0);

		});
	});
}

export function query(uri) {
	let bucket = connect(uri);

	bucket.operationTimeout = 7500;

	return new Promise((resolve, reject) => {

		console.log("query people with SUVs");

		let start = new Date();

		let vq = ViewQuery.from("benchmark", "withSUVs");

		vq.stale(ViewQuery.Update.BEFORE);

		bucket.query(vq, (err, results) => {
			if (err) return reject(err);

			let end = new Date();

			console.log(`people with SUVs: ${results.length}`);

			console.log(`people with SUVs in: ${(end.getTime() - start.getTime())}ms`);

			return resolve(results);
		});

	}).then(() => {

		return new Promise((resolve, reject) => {

			console.log("query number of convertibles");

			let start = new Date();

			let vq = ViewQuery.from("benchmark", "numConvertibles");

			vq.stale(ViewQuery.Update.BEFORE);

			bucket.query(vq, (err, results) => {
				if (err) return reject(err);

				let end = new Date();

				console.log(`number of convertibles: ${results[0].value}`);

				console.log(`number of convertibles in: ${(end.getTime() - start.getTime())}ms`);

				return resolve(results);
			});

		});

	}, (err) => {
		console.log(err);
		throw err;
	}).then(() => {

		return new Promise((resolve, reject) => {

			console.log("query average age");

			let start = new Date();

			let vq = ViewQuery.from("benchmark", "averageAge");

			vq.stale(ViewQuery.Update.BEFORE);

			bucket.query(vq, (err, results) => {
				if (err) return reject(err);

				let end = new Date();

				console.log(`average age: ${Math.round(results[0].value)}`);

				console.log(`average age: ${(end.getTime() - start.getTime())}ms`);

				resolve();
			});

		});

	}, (err) => {
		console.log(err);
		throw err;
	});
}

export default {
	"load": load,
	"query": query
}

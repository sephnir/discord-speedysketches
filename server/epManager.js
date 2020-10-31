import { config } from "dotenv";
config();

import mongoose from "mongoose";
const Token = mongoose.model("Token");
const Prompt = mongoose.model("Prompt");

import express, { static as serveStatic } from "express";
import bodyParser from "body-parser";
import helmet from "helmet";
import axios from "axios";
import http from "http";

import routes from "./routes.json";

// create application/json parser
const jsonParser = bodyParser.json();
// create application/x-www-form-urlencoded parser
const urlencodedParser = bodyParser.urlencoded({
	extended: false,
});

const port = process.env.PORT || 8000;
const hpUrl = process.env.HOMEPAGE_URL;

class EpManager {
	constructor(botManager) {
		this.botManager = botManager;
		this.app = express();
		this.server = http.Server(this.app);

		this.app.use(helmet()); // use helmet
		// app.use(require("cors")()); // enable CORS
		// serves all static files in /public
		this.app.use(serveStatic(`${__dirname}/../public`));

		// start server
		this.server.listen(port, () => {
			console.log(`Listening on port ${port}`);
		});

		this.webRoutes();
		this.apiRoutes();
	}

	webRoutes = () => {
		this.app.get(`/`, (req, res) => {
			this.fetchHomepage(res);
		});

		this.app.get(`/${routes.web.promptForm}/*`, (req, res) => {
			return res.sendFile(`${routes.web.promptForm}/index.html`, {
				root: `${__dirname}/../public`,
			});
		});

		this.app.get(`/${routes.web.managePrompts}/*`, (req, res) => {
			return res.sendFile(`${routes.web.managePrompts}/index.html`, {
				root: `${__dirname}/../public`,
			});
		});

		this.app.get("*", (req, res) => {
			return res.sendStatus(404);
		});
	};

	fetchHomepage = (res) => {
		if (hpUrl) {
			axios
				.get(hpUrl)
				.then((response) => {
					res.send(response.data);
				})
				.catch(async (error) => {
					console.log("Error fetching homepage");
				});
		} else {
			res.send("Hello world");
		}
	};

	apiRoutes = () => {
		this.app.post(
			`/api/${routes.api.authToken}`,
			jsonParser,
			(req, res) => {
				this.authToken(req, res);
			}
		);

		this.app.post(
			`/api/${routes.api.submitPrompt}`,
			jsonParser,
			(req, res) => {
				this.submitPrompt(req, res);
			}
		);

		this.app.post(
			`/api/${routes.api.fetchPrompts}`,
			jsonParser,
			(req, res) => {
				this.fetchPrompts(req, res);
			}
		);

		this.app.post(
			`/api/${routes.api.postPrompts}`,
			jsonParser,
			(req, res) => {
				this.postPromptsMsg(req, res);
			}
		);

		this.app.post(
			`/api/${routes.api.updatePromptsStatus}`,
			jsonParser,
			(req, res) => {
				this.updatePromptsStatus(req, res);
			}
		);
	};

	authToken(req, res) {
		if (!req.body) return res.sendStatus(400);

		res.setHeader("Content-Type", "application/json");
		Token.findOne({ token: req.body.token }, (err, inst) => {
			if (err) res.send({ error: err });
			res.send(inst);
		});
	}

	async fetchPrompts(req, res) {
		if (!req.body) return res.sendStatus(400);

		res.setHeader("Content-Type", "application/json");

		let result;
		try {
			result = await Token.findOne({ token: req.body.token });
		} catch (err) {
			res.statusMessage = err;
			res.sendStatus(500);
			return;
		}

		if (!result || !result.admin) {
			res.statusMessage = "Invalid token.";
			res.sendStatus(401);
			return;
		}

		Prompt.find({}, (err, inst) => {
			if (err) res.send({ error: err });
			res.send(inst);
		});
	}

	async submitPrompt(req, res) {
		if (!req.body) return res.sendStatus(400);

		res.setHeader("Content-Type", "application/json");

		let result;
		try {
			result = await Token.findOne({ token: req.body.token });
		} catch (err) {
			res.statusMessage = err;
			res.sendStatus(500);
			return;
		}

		if (!result) {
			res.statusMessage = "Invalid token.";
			res.sendStatus(401);
			return;
		}

		let prompt = new Prompt({
			userId: result.userId,
			userName: result.userName,
			prompt: req.body.prompt,
			duration: req.body.duration,
			anonymous: req.body.anon,
		});

		await prompt.save();
		res.send({ success: true });
	}

	async updatePromptsStatus(req, res) {
		if (!req.body) return res.sendStatus(400);
		if (
			!req.body.prompts ||
			req.body.prompts.length == 0 ||
			!req.body.statuses ||
			req.body.prompts.length != req.body.statuses.length
		)
			return res.sendStatus(400);

		res.setHeader("Content-Type", "application/json");

		let result;
		try {
			result = await Token.findOne({ token: req.body.token });
		} catch (err) {
			res.statusMessage = err;
			res.sendStatus(500);
			return;
		}

		if (!result || !result.admin) {
			res.statusMessage = "Invalid token.";
			res.sendStatus(401);
			return;
		}
		let idArr = req.body.prompts;
		let val = req.body.statuses;
		await this._updatePromptsStatus(idArr, val);

		res.sendStatus(200);
	}

	async _updatePromptsStatus(idArr, val) {
		for (let i = 0; i < idArr.length; i++) {
			await Prompt.findOneAndUpdate(
				{ _id: idArr[i] },
				{ posted: val[i] }
			);
		}
	}

	async postPromptsMsg(req, res) {
		if (!req.body) return res.sendStatus(400);
		if (!req.body.prompts || req.body.prompts.length != 5)
			return res.sendStatus(400);
		if (!req.body.message) return res.sendStatus(400);

		res.setHeader("Content-Type", "text/plain");
		let result;
		try {
			result = await Token.findOne({ token: req.body.token });
		} catch (err) {
			res.statusMessage = err;
			res.sendStatus(500);
			return;
		}

		if (!result || !result.admin) {
			res.statusMessage = "Invalid token.";
			res.sendStatus(401);
			return;
		}
		this.botManager.sendPromptsMsg(req.body.message);

		let query = [];
		let trues = [];

		for (let i = 0; i < req.body.prompts.length; i++) {
			query.push(mongoose.Types.ObjectId(req.body.prompts[i]));
			trues.push(true);
		}

		await this._updatePromptsStatus(query, trues);
		return res.sendStatus(200);
	}

	async postPrompts(req, res) {
		if (!req.body) return res.sendStatus(400);
		if (!req.body.prompts || req.body.prompts.length != 5)
			return res.sendStatus(400);

		res.setHeader("Content-Type", "application/json");

		let result;
		try {
			result = await Token.findOne({ token: req.body.token });
		} catch (err) {
			res.statusMessage = err;
			res.sendStatus(500);
			return;
		}

		if (!result || !result.admin) {
			res.statusMessage = "Invalid token.";
			res.sendStatus(401);
			return;
		}
		let query = [];
		let trues = [];

		for (let i = 0; i < req.body.prompts.length; i++) {
			query.push(mongoose.Types.ObjectId(req.body.prompts[i]));
			trues.push(true);
		}

		this._updatePromptsStatus(query, trues);

		Prompt.find({ _id: { $in: query } }, (err, inst) => {
			if (err) res.send({ error: err });
			this.botManager.sendPrompts(inst);

			return res.sendStatus(200);
		});
	}
}

export default EpManager;

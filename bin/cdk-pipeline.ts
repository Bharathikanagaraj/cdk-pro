#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EC2RDSStack } from '../lib/cdk-pipeline-stack';

const app = new cdk.App();
new EC2RDSStack(app, 'EC2RDSStack', {});
